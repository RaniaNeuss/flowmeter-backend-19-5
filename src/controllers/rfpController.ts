// rfpController.ts

import { Request, Response } from 'express';
import prisma from '../prismaClient';
import fs from 'fs/promises';
import path from 'path'; // To get the file extension easily
import { v4 as uuidv4 } from 'uuid';

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📥 Upload request received.");
    console.log("🧾 req.body:", req.body);
    console.log("📎 req.files:", req.files);

    const file = (req.files as Express.Multer.File[])?.[0];
    const {
      rfpid,
      filename_download,
      title,
      description,
      location,
      tags,
      width,
      height,
      duration,
      folderId
    } = req.body;

    // Get uploader ID from auth middleware
    const uploaderId = req.userId || null;

    if (!file ) {
      res.status(400).json({ error: 'File is required.' });
      return;
    }

    const stats = await fs.stat(file.path);

    // Determine file type from extension
    const extension = path.extname(file.originalname).substring(1).toLowerCase();
    const type = extension;

    // Generate UUID for attachment id
    const id = uuidv4();

    // Compute folder path and file name
    const uploadsBase = path.join(file.destination, folderId ? String(folderId) : '');
    await fs.mkdir(uploadsBase, { recursive: true });
    const filenameDisk = `${id}.${type}`;
    const newFilePath = path.join(uploadsBase, filenameDisk);

    // Move file to the final path
    await fs.rename(file.path, newFilePath);

    // Compute the folderPath (optional)
    const folderPath = folderId ? path.join('uploads', String(folderId), filenameDisk) : path.join('uploads', filenameDisk);

    // Save record in DB
    const attachment = await prisma.flowMeterAttachment.create({
      data: {
        id,  // UUID
        rfpId: Number(rfpid)|| null,
        uploaderId,
        folderId: folderId ? String(folderId) : null,
        type,
        typeOfAttachment: 'AnotherFile', // Default type, can be changed later
        filePath: folderPath,
        filename_disk: filenameDisk,
        filename_download: filename_download || file.originalname,
        uploadedAt: new Date(),
        createdAt: new Date(),
        title: title || null,
        description: description || null,
        location: location || null,
        tags: tags || null,
        width: width ? parseInt(width, 10) : null,
        height: height ? parseInt(height, 10) : null,
        duration: duration ? parseFloat(duration) : null,
        filesize: stats.size
      }
    });

    res.status(201).json({
      message: 'File uploaded successfully.',
      attachment
    });
  } catch (err: any) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: 'Failed to upload file.', details: err.message });
  }
};


export const createFullRfp = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      BasicInformation,
      GeneralInfo,
     
      MonitoringDetails,
      approvalDetails,
      FlowmeterDetails,
      FlowmeterInventory,
      
      FlowmeterInstallationMaintenance,
      DataCollectionExchange,
      maf,
      attachments, // expects [{ FlowMeterImages: [...], CollaborationCertificate: "...", AnotherFile: [...] }]
    } = req.body;

    const { typeOfRfp, rfpReference } = BasicInformation || {};
    if (!typeOfRfp || !rfpReference?.trim()) {
      return void res.status(400).json({ error: 'typeOfRfp and rfpReference are required.' });
    }

      const duplicate = await prisma.rfp.findUnique({ where: { RfpReference: rfpReference } });
    if (duplicate) {
      return void res.status(409).json({
        error: "conflict_error",
        message: `RfpReference "${rfpReference}" already exists.`,
      });
    }

    const g = GeneralInfo;
    const l = MonitoringDetails?.location;
    const fm = FlowmeterDetails?.flowMonitoring;
    const inv = FlowmeterInventory?.inventory;
    const inst = FlowmeterInstallationMaintenance?.installation;
    const maint = FlowmeterInstallationMaintenance?.maintenance;
    const dce = DataCollectionExchange;

    if (!g?.licensee || !g.address || !g.contactNumber || !g.reportDate || !g.reportRef ||
        !g.responsiblePosition || !g.responsibleDepartment || !g.fmIdScada || !g.fmIdSwsAssetNo) {
      return void res.status(400).json({ error: 'All GeneralInfo fields are required.' });
    }

    if (!l?.description || l.coordinateN === undefined || l.coordinateE === undefined ||
        !l.region || !l.stpcc || !l.siteDrawingRef || !l.flowDiagramRef) {
      return void res.status(400).json({ error: 'All Location fields are required.' });
    }

    if (!fm?.flowDiagramRef || !fm.selectedOption) {
      return void res.status(400).json({ error: 'All FlowMonitoring fields are required.' });
    }

    if (!inv || !inst || !maint) {
      return void res.status(400).json({ error: 'Flowmeter inventory, installation, and maintenance are required.' });
    }

    if (!dce?.startDate || !dce.completionDate || !dce.data) {
      return void res.status(400).json({ error: 'All DataCollectionExchange fields are required.' });
    }

    // Flatten attachments
   const flatAttachmentIds: string[] = attachments?.[0]
  ? (Object.values(attachments[0]).flat() as string[])
  : [];

    const [inventory, installation, maintenance] = await Promise.all([
      prisma.inventory.create({ data: inv }),
      prisma.installation.create({
        data: {
          ...inst,
          meterInstallDate: fm.meterInstallDate || null,
          meterRemovalDate: fm.meterRemovalDate || null,
        },
      }),
      prisma.maintenance.create({ data: maint }),
    ]);

    const rfp = await prisma.rfp.create({
      data: {
        typeOfRfp,
        RfpReference: rfpReference,
        startDate: dce.startDate,
        completionDate: dce.completionDate,
       

        LocationType: {
          create: { type: g.locationType },
        },
        approvalDetails: {
  create: {
    approvalExpiry: approvalDetails.approvalExpiry,
    approvedReapplication: approvalDetails.approvedReapplication,
    appealApplication: approvalDetails.appealApplication,
    appealExtensionApplication: approvalDetails.appealExtensionApplication,
    appealExtensionDecision: approvalDetails.appealExtensionDecision,
    panelAppealMeeting: approvalDetails.panelAppealMeeting,
    panelAppealDecisionDate:approvalDetails.panelAppealDecisionDate,
    doeAppealDecisionDate: approvalDetails.doeAppealDecisionDate,
    panelAppealFinalResult: approvalDetails.panelAppealFinalResult,
  },
},
        generalInfo: {
          create: {
            licensee: g.licensee,
            address: g.address,
            contactNumber: g.contactNumber,
            faxNumber: g.faxNumber,
            reportDate: g.reportDate,
            reportRef: g.reportRef,
            responsiblePosition: g.responsiblePosition,
            responsibleDepartment: g.responsibleDepartment,
            fmIdScada: g.fmIdScada,
            fmIdSwsAssetNo: g.fmIdSwsAssetNo,
            siteManagerName: g.siteManagerName,
          },
        },

        location: {
          create: {
            region: l.region,
            stpcc: l.stpcc,
            description: l.description,
            coordinateN: Number(l.coordinateN),
            coordinateE: Number(l.coordinateE),
            siteDrawingRef: l.siteDrawingRef,
            flowDiagramRef: l.flowDiagramRef,
          },
        },

        flowMeasurement: {
          create: {
            selectedOption: fm.selectedOption,
          },
        },

        flowRegister: {
          create: {
            inventory: { connect: { id: inventory.id } },
            installation: { connect: { id: installation.id } },
            maintenance: { connect: { id: maintenance.id } },
          },
        },

        data: {
          create: dce.data,
        },

        maf: {
          create: maf,
        },

        // attachments: {
        //   connect: flatAttachmentIds.map((id: string) => ({ id })),
        // },
      },
      include: {
        LocationType: true,
        generalInfo: true,
        location: true,
        
        flowMeasurement: true,
        flowRegister: {
          include: {
            inventory: true,
            installation: true,
            maintenance: true,
          },
        },
        data: true,
        maf: true,
        attachments: true,
      },
    });

    // ✅ Update rfpId field in FlowMeterAttachment table
    if (flatAttachmentIds.length > 0) {
      await prisma.flowMeterAttachment.updateMany({
        where: { id: { in: flatAttachmentIds } },
        data: { rfpId: rfp.id },
      });
    }

    console.log("✅ RFP created with ID:", rfp.id);
    return void res.status(201).json(rfp);
  } catch (err: any) {
    console.error("❌ createFullRfp error:", err);
    return void res.status(500).json({ error: err.message || "Internal server error" });
  }
};

export const updateFullRfp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rfpId = Number(id);

    const {
      BasicInformation,
      generalInfo,
    
      MonitoringDetails,
      approvalDetails,
      FlowmeterDetails,
      FlowmeterInventory,
      FlowmeterInstallationMaintenance,
      DataCollectionExchange,
      maf,
      attachments,
    } = req.body;

    const existing = await prisma.rfp.findUnique({ where: { id: rfpId } });
    if (!existing) return void res.status(404).json({ error: "RFP not found" });

    const flatAttachmentIds: string[] = attachments?.[0]
      ? (Object.values(attachments[0]).flat() as string[])
      : [];

    // ✅ Step 1: Update one-to-one nested models explicitly
    if (generalInfo) {
      await prisma.generalInfo.update({
        where: { rfpId },
        data: {
          licensee: generalInfo.licensee,
          address: generalInfo.address,
          contactNumber: generalInfo.contactNumber,
          faxNumber: generalInfo.faxNumber,
          reportDate: generalInfo.reportDate,
          reportRef: generalInfo.reportRef,
          responsiblePosition: generalInfo.responsiblePosition,
          responsibleDepartment: generalInfo.responsibleDepartment,
          fmIdScada: generalInfo.fmIdScada,
          fmIdSwsAssetNo: generalInfo.fmIdSwsAssetNo,
          siteManagerName: generalInfo.siteManagerName,
        },
      });
    }

    if (MonitoringDetails?.location) {
      await prisma.location.update({
        where: { rfpId },
        data: {
          region: MonitoringDetails.location.region,
          stpcc: MonitoringDetails.location.stpcc,
          description: MonitoringDetails.location.description,
          coordinateN: MonitoringDetails.location.coordinateN,
          coordinateE: MonitoringDetails.location.coordinateE,
          siteDrawingRef: MonitoringDetails.location.siteDrawingRef,
          flowDiagramRef: MonitoringDetails.location.flowDiagramRef,
        },
      });
    }

    if (approvalDetails) {
      await prisma.approvalDetails.update({
        where: { rfpId },
        data: approvalDetails,
      });
    }

    if (FlowmeterDetails?.flowMonitoring?.selectedOption) {
      await prisma.flowMeasurement.update({
        where: { rfpId },
        data: {
          selectedOption: FlowmeterDetails.flowMonitoring.selectedOption,
        },
      });
    }

    if (DataCollectionExchange?.data) {
      await prisma.data.update({
        where: { rfpId },
        data: DataCollectionExchange.data,
      });
    }

    if (maf) {
      await prisma.mAF.update({
        where: { rfpId },
        data: maf,
      });
    }

    // ✅ Step 2: Update flow register components if exist
    const flowRegister = await prisma.flowMonitoringRegister.findUnique({ where: { rfpId } });
    if (flowRegister) {
      await Promise.all([
        FlowmeterInventory?.inventory &&
          prisma.inventory.update({
            where: { id: flowRegister.inventoryId },
            data: FlowmeterInventory.inventory,
          }),

        FlowmeterInstallationMaintenance?.installation &&
          prisma.installation.update({
            where: { id: flowRegister.installationId },
            data: {
              ...FlowmeterInstallationMaintenance.installation,
              meterInstallDate: FlowmeterDetails?.flowMonitoring?.meterInstallDate,
              meterRemovalDate: FlowmeterDetails?.flowMonitoring?.meterRemovalDate,
            },
          }),

        FlowmeterInstallationMaintenance?.maintenance &&
          prisma.maintenance.update({
            where: { id: flowRegister.maintenanceId },
            data: FlowmeterInstallationMaintenance.maintenance,
          }),
      ]);
    }

    // ✅ Step 3: Update RFP root fields
    const updatedRfp = await prisma.rfp.update({
      where: { id: rfpId },
      data: {
        typeOfRfp: BasicInformation?.typeOfRfp,
        RfpReference: BasicInformation?.rfpReference,
        startDate: DataCollectionExchange?.startDate,
        completionDate: DataCollectionExchange?.completionDate,
      
        LocationType: MonitoringDetails?.locationType?.type
          ? {
              upsert: {
                update: { type: MonitoringDetails.locationType.type },
                create: { type: MonitoringDetails.locationType.type },
              },
            }
          : undefined,
      },
      include: {
        LocationType: true,
        generalInfo: true,
        location: true,
        flowMeasurement: true,
        flowRegister: {
          include: {
            inventory: true,
            installation: true,
            maintenance: true,
          },
        },
        data: true,
        maf: true,
        approvalDetails: true,
        attachments: true,
      },
    });

    // ✅ Step 4: Reassign attachments to this RFP
    if (flatAttachmentIds.length > 0) {
      await prisma.flowMeterAttachment.updateMany({
        where: { id: { in: flatAttachmentIds } },
        data: { rfpId },
      });
    }

    console.log("✅ RFP updated successfully");
    res.status(200).json(updatedRfp);
  } catch (err: any) {
    if (res.headersSent) return;

    console.error("❌ createFullRfp error:", err);

    // Handle Prisma unique constraint error
    if (err.code === 'P2002' && err.meta?.target?.includes('RfpReference')) {
      return void res.status(409).json({
        error: "conflict_error",
        message: `RfpReference "${req.body?.BasicInformation?.rfpReference}" already exists.`,
      });
    }

    return void res.status(500).json({ error: err.message || "Internal server error" });
  }
};


export const getFullRfps = async (req: Request, res: Response): Promise<void> => {
  try {
    const rfps = await prisma.rfp.findMany({
      include: {
        LocationType: true,
        generalInfo: true,
         approvalDetails: true,
        location: true,
        flowMeasurement: true,
        flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
        data: true,
        maf: true,
       attachments: {
  select: { id: true, typeOfAttachment: true }
}
      },
    });
     res.status(200).json(rfps);
  } catch (err: any) {
    console.error('❌ getFullRfps error:', err);
     res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// export const getRfpById = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;
//     const rfp = await prisma.rfp.findUnique({
//       where: { id: Number(id) },
//       include: {
//         LocationType: true,
//         generalInfo: true,
//         location: true,
//         flowMeasurement: true,
//         flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
//         data: true,
//         maf: true,
//         attachments: {
//   select: { id: true, typeOfAttachment: true }
// }
//       },
//     });

//     if (!rfp) {
//      res.status(404).json({ error: 'RFP not found' });
//     }

//     res.status(200).json(rfp);

//   } catch (err: any) {
//     console.error('❌ getRfpById error:', err);
//     res.status(500).json({ error: err.message || 'Internal server error' });
//   }
// };

export const getRfpById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rfp = await prisma.rfp.findUnique({
      where: { id: Number(id) },
      include: {
        LocationType: true,
        generalInfo: true,
        location: true,
        flowMeasurement: true,
        flowRegister: {
          include: {
            inventory: true,
            installation: true,
            maintenance: true,
          },
        },
        data: true,
        maf: true,
        approvalDetails: true, // ✅ add this
        attachments: {
          select: {
            id: true,
            typeOfAttachment: true,
          },
        },
      },
    });

    if (!rfp) {
      res.status(404).json({ error: 'RFP not found' });
      return;
    }

    const groupedAttachments: Record<string, string[] | string> = {};

    for (const att of rfp.attachments) {
      const key = att.typeOfAttachment ?? 'Unknown';

      if (!(key in groupedAttachments)) {
        groupedAttachments[key] = att.id;
      } else {
        const current = groupedAttachments[key];
        groupedAttachments[key] = Array.isArray(current)
          ? [...current, att.id]
          : [current, att.id];
      }
    }

    const response = {
      ...rfp,
      attachments: [groupedAttachments],
    };

    res.status(200).json(response);
  } catch (err: any) {
    console.error('❌ getRfpById error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

export const deleteRfp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const rfpId = Number(id);

    const existing = await prisma.rfp.findUnique({ where: { id: rfpId } });
    if (!existing) {
      res.status(404).json({ error: 'RFP not found' });
      return;
    }

    // Delete all dependent records in correct order:
    await prisma.flowMeterAttachment.deleteMany({ where: { rfpId } });
    await prisma.data.deleteMany({ where: { rfpId } });
    await prisma.mAF.deleteMany({ where: { rfpId } });
    await prisma.flowMonitoringRegister.deleteMany({ where: { rfpId } });
    await prisma.flowMeasurement.deleteMany({ where: { rfpId } });
    await prisma.location.deleteMany({ where: { rfpId } });
    await prisma.generalInfo.deleteMany({ where: { rfpId } });
    await prisma.locationType.deleteMany({ where: { rfpId } });

    // Delete the RFP itself
    await prisma.rfp.delete({ where: { id: rfpId } });

    res.status(200).json({ message: 'RFP and its related data deleted successfully' });
  } catch (err: any) {
    console.error('❌ deleteRfp error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// PATCH /api/rfp/:id







export const updateFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      filename_download,
      title,
      description,
      location,
      tags,
      width,
      height,
      duration
    } = req.body;

    const updatedById = req.userId; // From the authentication middleware

    const updatedAttachment = await prisma.flowMeterAttachment.update({
      where: { id },
      data: {
        filename_download: filename_download || undefined,
        title: title || undefined,
        description: description || undefined,
        location: location || undefined,
        tags: tags || undefined,
        width: width ? parseInt(width, 10) : undefined,
        height: height ? parseInt(height, 10) : undefined,
        duration: duration ? parseFloat(duration) : undefined,
        updatedById
      }
    });

    res.status(200).json({
      message: 'File updated successfully.',
      attachment: updatedAttachment
    });
  } catch (err: any) {
    console.error('❌ Update file error:', err);
    res.status(500).json({ error: 'Failed to update file.', details: err.message });
  }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deletedById = req.userId; // From the auth middleware

    // Update the record first to track who deleted it
    await prisma.flowMeterAttachment.update({
      where: { id },
      data: { updatedById: deletedById }
    });

    // Delete the file record
    await prisma.flowMeterAttachment.delete({
      where: { id }
    });

    res.status(200).json({ message: 'File deleted successfully.' });
  } catch (err: any) {
    console.error('❌ Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file.', details: err.message });
  }
};
// export const getFilesByRfpId = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { rfpId } = req.params;

//     if (!rfpId) {
//       res.status(400).json({ error: 'rfpId parameter is required.' });
//       return;
//     }

//     const attachments = await prisma.flowMeterAttachment.findMany({
//       where: { rfpId: Number(rfpId) },
//       orderBy: { uploadedAt: 'desc' }
//     });

//     if (!attachments || attachments.length === 0) {
//       res.status(404).json({ message: 'No attachments found for the given RFP ID.' });
//       return;
//     }

//     res.status(200).json({
//       message: 'Attachments fetched successfully.',
//       attachments
//     });
//     return;
//   } catch (err: any) {
//     console.error('❌ getFilesByRfpId error:', err);
//     res.status(500).json({ error: 'Failed to fetch attachments.', details: err.message });
//     return;
//   }
// };

export const getFilesByRfpId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { rfpId } = req.params;

    if (!rfpId) {
      res.status(400).json({ error: 'rfpId parameter is required.' });
      return;
    }

    const attachments = await prisma.flowMeterAttachment.findMany({
      where: { rfpId: Number(rfpId) },
      orderBy: { uploadedAt: 'desc' },
    });

    const grouped = {
      CollaborationCertificate: attachments
        .filter((a) => a.typeOfAttachment === 'CollaborationCertificate')
        .map((a) => a.id),
      AnotherFile: attachments
        .filter((a) => a.typeOfAttachment === 'AnotherFile')
        .map((a) => a.id),
      FlowMeterImages: attachments
        .filter((a) => a.typeOfAttachment === 'FlowMeterImages')
        .map((a) => a.id),
    };

    res.status(200).json({
      message: 'Attachments grouped by typeOfAttachment.',
      attachments: grouped,
    });
  } catch (err: any) {
    console.error('❌ getFilesByRfpId error:', err);
    res.status(500).json({ error: 'Failed to fetch attachments.', details: err.message });
  }
};




export const getFilteredRfps = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search = '', typeFilter = '', licenseeFilter = '' } = req.body;
    const skip = (Number(page) - 1) * Number(limit);

    const filters: any[] = [];

    if (search) {
      filters.push({
        OR: [
          { RfpReference: { contains: search } },
          { typeOfRfp: { contains: search } },
          { generalInfo: { is: { licensee: { contains: search } } } },
        ],
      });
    }

    if (typeFilter) {
      filters.push({ typeOfRfp: { equals: typeFilter } });
    }

    if (licenseeFilter) {
      filters.push({ generalInfo: { is: { licensee: { equals: licenseeFilter } } } });
    }

    const where = filters.length > 0 ? { AND: filters } : {};

    const [data, total] = await Promise.all([
      prisma.rfp.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { id: 'desc' },
        include: {
          LocationType: true,
          generalInfo: true,
          location: true,
          flowMeasurement: true,
          flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
          data: true,
          maf: true,
          attachments: true,
        },
      }),
      prisma.rfp.count({ where }),
    ]);

    res.status(200).json({
      data,
      meta: { total, page: Number(page), lastPage: Math.ceil(total / Number(limit)) },
    });

  } catch (err: any) {
    console.error('❌ getFilteredRfps error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
