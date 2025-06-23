// rfpController.ts

import { Request, Response } from 'express';
import prisma from '../prismaClient';
import multer from 'multer';
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
      LocationMeasurement,
      MonitoringDetails,
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
      return void res.status(409).json({ error: `Duplicate RfpReference: ${rfpReference}` });
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
        panelMeetingDate: LocationMeasurement?.approvalDetails?.panelAppealMeeting,
        panelDecisionDate: LocationMeasurement?.approvalDetails?.panelAppealDecisionDate,

        LocationType: {
          create: { type: g.locationType },
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
   if (attachments?.length > 0) {
  const attachmentObj = attachments[0];
  const updateOps: Promise<any>[] = [];

  for (const [typeOfAttachment, ids] of Object.entries(attachmentObj)) {
    const attachmentIds = Array.isArray(ids) ? ids : [ids];
    for (const id of attachmentIds) {
      updateOps.push(
        prisma.flowMeterAttachment.update({
          where: { id: id as string },
          data: {
            rfpId: rfp.id,
            typeOfAttachment,
          },
        })
      );
    }
  }

  await Promise.all(updateOps);
}


    console.log("✅ RFP created with ID:", rfp.id);
    return void res.status(201).json(rfp);
  } catch (err: any) {
    console.error("❌ createFullRfp error:", err);
    return void res.status(500).json({ error: err.message || "Internal server error" });
  }
};



export const getFullRfps = async (req: Request, res: Response): Promise<void> => {
  try {
    const rfps = await prisma.rfp.findMany({
      include: {
        LocationType: true,
        generalInfo: true,
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
        flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
        data: true,
        maf: true,
        attachments: {
  select: { id: true, typeOfAttachment: true }
}
      },
    });

    if (!rfp) {
     res.status(404).json({ error: 'RFP not found' });
    }

    res.status(200).json(rfp);

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


export const patchRfp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const patchData = req.body;

    const existing = await prisma.rfp.findUnique({
      where: { id: Number(id) },
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
    });

    if (!existing) {
      res.status(404).json({ error: 'RFP not found' });
      return;
    }

    // Prepare update object with optional nested updates
    const updateData: any = {};

    // Top-level fields
    if (patchData.BasicInformation?.typeOfRfp) {
      updateData.typeOfRfp = patchData.BasicInformation.typeOfRfp;
    }
    if (patchData.BasicInformation?.rfpReference) {
      updateData.RfpReference = patchData.BasicInformation.rfpReference;
    }

    // Example: GeneralInfo partial update
    if (patchData.GeneralInfo) {
      updateData.generalInfo = {
        update: patchData.GeneralInfo,
      };
    }

    // Example: Location partial update
    if (patchData.MonitoringDetails?.location) {
      updateData.location = {
        update: patchData.MonitoringDetails.location,
      };
    }

    // Repeat for other nested relations as needed:
    if (patchData.LocationMeasurement?.approvalDetails) {
      updateData.panelMeetingDate = patchData.LocationMeasurement.approvalDetails.panelAppealMeeting;
      updateData.panelDecisionDate = patchData.LocationMeasurement.approvalDetails.panelAppealDecisionDate;
    }

    if (patchData.MonitoringDetails?.locationType) {
      updateData.LocationType = {
        update: patchData.MonitoringDetails.locationType,
      };
    }

    if (patchData.FlowmeterDetails?.flowMonitoring?.selectedOption) {
      updateData.flowMeasurement = {
        update: { selectedOption: patchData.FlowmeterDetails.flowMonitoring.selectedOption },
      };
    }

    if (patchData.DataCollectionExchange?.data) {
      updateData.data = {
        update: patchData.DataCollectionExchange.data,
      };
    }

    if (patchData.DataCollectionExchange?.maf) {
      updateData.maf = {
        update: patchData.DataCollectionExchange.maf,
      };
    }

    // Finally, apply the update
    const updatedRfp = await prisma.rfp.update({
      where: { id: Number(id) },
      data: updateData,
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
    });

    res.status(200).json(updatedRfp);
  } catch (err: any) {
    console.error('❌ patchRfp error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};


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

//   try {
//     const { id } = req.params;
//     const patchData = req.body;

//     const existing = await prisma.rfp.findUnique({ where: { id: Number(id) } });
//     if (!existing) {
//       res.status(404).json({ error: 'RFP not found' });
//     }

//     const updated = await prisma.rfp.update({
//       where: { id: Number(id) },
//       data: patchData,
//       include: {
//         LocationType: true,
//         generalInfo: true,
//         location: true,
//         flowMeasurement: true,
//         flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
//         data: true,
//         maf: true,
//         attachments: true,
//       },
//     });

//      res.status(200).json(updated);

//   } catch (err: any) {
//     console.error('❌ patchRfp error:', err);
//    res.status(500).json({ error: err.message || 'Internal server error' });
//   }
// };
// export const updateFullRfp = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const { id } = req.params;
//     const rfpId = Number(id);

//     // Find existing RFP to ensure it exists
//     const existing = await prisma.rfp.findUnique({
//       where: { id: rfpId },
//       include: {
//         LocationType: true,
//         generalInfo: true,
//         location: true,
//         flowMeasurement: true,
//         flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
//         data: true,
//         maf: true,
//         attachments: true,
//       },
//     });

//     if (!existing) {
//       res.status(404).json({ error: 'RFP not found' });
//       return;
//     }

//     const {
//       BasicInformation,
//       GeneralInfo,
//       LocationMeasurement,
//       MonitoringDetails,
//       FlowmeterDetails,
//       DataCollectionExchange,
//     } = req.body;

//     const { typeOfRfp, rfpReference } = BasicInformation || {};

//     if (!typeOfRfp || !rfpReference?.trim()) {
//       res.status(400).json({ error: 'typeOfRfp and rfpReference are required.' });
//       return;
//     }

//     // Update the RFP itself and nested relations
//     const updatedRfp = await prisma.rfp.update({
//       where: { id: rfpId },
//       data: {
//         typeOfRfp,
//         RfpReference: rfpReference,
//         startDate: DataCollectionExchange.startDate,
//         completionDate: DataCollectionExchange.completionDate,
//         panelMeetingDate: LocationMeasurement?.approvalDetails?.panelAppealMeeting,
//         panelDecisionDate: LocationMeasurement?.approvalDetails?.panelAppealDecisionDate,

//         LocationType: {
//           update: {
//             type: MonitoringDetails?.locationType?.type || existing.LocationType?.type || '',
//           },
//         },

//         generalInfo: {
//           update: {
//             licensee: GeneralInfo.licensee || existing.generalInfo?.licensee || '',
//             address: GeneralInfo.address || existing.generalInfo?.address || '',
//             contactNumber: GeneralInfo.contactNumber || existing.generalInfo?.contactNumber || '',
//             faxNumber: GeneralInfo.faxNumber || existing.generalInfo?.faxNumber || '',
//             reportDate: GeneralInfo.reportDate || existing.generalInfo?.reportDate || '',
//             reportRef: GeneralInfo.reportRef || existing.generalInfo?.reportRef || '',
//             responsiblePosition: GeneralInfo.responsiblePosition || existing.generalInfo?.responsiblePosition || '',
//             responsibleDepartment: GeneralInfo.responsibleDepartment || existing.generalInfo?.responsibleDepartment || '',
//             fmIdScada: GeneralInfo.fmIdScada || existing.generalInfo?.fmIdScada || '',
//             fmIdSwsAssetNo: GeneralInfo.fmIdSwsAssetNo || existing.generalInfo?.fmIdSwsAssetNo || '',
//             siteManagerName: GeneralInfo.siteManagerName || existing.generalInfo?.siteManagerName || '',
//           },
//         },

//         location: {
//           update: {
//             region: MonitoringDetails.location.region || existing.location?.region || '',
//             stpcc: MonitoringDetails.location.stpcc || existing.location?.stpcc || '',
//             description: MonitoringDetails.location.description || existing.location?.description || '',
//             coordinateN: Number(MonitoringDetails.location.coordinateN) || existing.location?.coordinateN || 0,
//             coordinateE: Number(MonitoringDetails.location.coordinateE) || existing.location?.coordinateE || 0,
//             siteDrawingRef: MonitoringDetails.location.siteDrawingRef || existing.location?.siteDrawingRef || '',
//             flowDiagramRef: MonitoringDetails.location.flowDiagramRef || existing.location?.flowDiagramRef || '',
//           },
//         },

//         flowMeasurement: {
//           update: {
//             selectedOption: FlowmeterDetails?.flowMonitoring?.selectedOption || existing.flowMeasurement?.selectedOption || '',
//           },
//         },

//         data: {
//           update: DataCollectionExchange.data,
//         },

//         maf: {
//           update: DataCollectionExchange.maf,
//         },
//       },
//       include: {
//         LocationType: true,
//         generalInfo: true,
//         location: true,
//         flowMeasurement: true,
//         flowRegister: {
//           include: {
//             inventory: true,
//             installation: true,
//             maintenance: true,
//           },
//         },
//         data: true,
//         maf: true,
//         attachments: true,
//       },
//     });

//     res.status(200).json(updatedRfp);
//   } catch (err: any) {
//     console.error('❌ updateFullRfp error:', err);
//     res.status(500).json({ error: err.message || 'Internal server error' });
//   }
// };





// export const uploadFile = async (req: Request, res: Response): Promise<void> => {
//   try {
//     console.log("📥 Upload request received.");
//     console.log("🧾 req.body:", req.body);
//     console.log("📎 req.files:", req.files);

//     const file = (req.files as Express.Multer.File[])?.[0];
//     const {
//       type,
//       rfpid,
//       title,
//       description,
//       location,
//       tags,
//       width,
//       height,
//       duration,
//       charset
//     } = req.body;

//     if (!file || !type || !rfpid) {
//       res.status(400).json({ error: 'File, type, and rfpid are required.' });
//       return;
//     }

//     const buffer = await fs.readFile(file.path);
//     const fileAsString = buffer.toString('utf-8');
//     const stats = await fs.stat(file.path);

//     const attachment = await prisma.flowMeterAttachment.create({
//       data: {
//         rfpId: Number(rfpid),
//         type,
//         filePath: fileAsString,
//         filename_disk: file.filename,
//         filename_download: file.originalname,
//         uploadedAt: new Date(),
//         createdAt: new Date(),
//         title: title || null,
//         description: description || null,
//         location: location || null,
//         tags: tags || null,
//         width: width ? parseInt(width, 10) : null,
//         height: height ? parseInt(height, 10) : null,
//         duration: duration ? parseFloat(duration) : null,
//         filesize: stats.size,
//         charset: charset || null,
//       },
//     });

//     await fs.unlink(file.path);

//     res.status(201).json({ message: 'File uploaded successfully.', attachment });
//   } catch (err: any) {
//     console.error('❌ Upload error:', err);
//     res.status(500).json({ error: 'Failed to upload file.', details: err.message });
//   }
// };


// export const createFullRfp = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const {
//       BasicInformation,
//       GeneralInfo,
//       LocationMeasurement,
//       MonitoringDetails,
//       FlowmeterDetails,
//       FlowmeterInventory,
//       FlowmeterInstallationMaintenance,
//       DataCollectionExchange,
//     } = req.body;

//     const { typeOfRfp, rfpReference } = BasicInformation;

//     if (!rfpReference?.trim()) {
//       res.status(400).json({ error: 'rfpReference is required.' }); 
//     }

//     const duplicate = await prisma.rfp.findUnique({ where: { RfpReference: rfpReference } });
//    if (duplicate) {
//   res.status(409).json({ error: `Duplicate RfpReference: ${rfpReference}` });
//   return; // <-- REQUIRED to prevent continuing
// }

//     if (!GeneralInfo?.licensee?.trim()) {
//       res.status(400).json({ error: 'Licensee is required in GeneralInfo.' });return;
//     }

//     const inventory = FlowmeterDetails?.flowMonitoring?.inventory
//       ? await prisma.inventory.create({ data: FlowmeterDetails.flowMonitoring.inventory })
//       : await prisma.inventory.create({
//           data: {
//             make: '', type: '', model: '', serial: '',
//             fmSize: '', pipelineSize: '', velocityRange: '',
//             accuracyReading: '', accuracyFullScale: '', readingMethod: ''
//           }
//         });

//     const installation = FlowmeterDetails?.flowMonitoring?.installation
//       ? await prisma.installation.create({ data: FlowmeterDetails.flowMonitoring.installation })
//       : await prisma.installation.create({
//           data: {
//             meterInstallDate: '',
//             meterRemovalDate: '',
//             hydraulicUpstream: '',
//             hydraulicDownstream: '',
//             environmental: '',
//             onSiteTesting: '',
//             safetyRisks: '',
//             securityOfLocation: ''
//           }
//         });

//     const maintenance = FlowmeterDetails?.flowMonitoring?.maintenance
//       ? await prisma.maintenance.create({ data: FlowmeterDetails.flowMonitoring.maintenance })
//       : await prisma.maintenance.create({ data: { maintenanceRef: false, preventativeScheduleRef: false } });

//     const rfp = await prisma.rfp.create({
//       data: {
//         typeOfRfp,
//         RfpReference: rfpReference,
//         startDate: DataCollectionExchange.startDate ?? '',
//         completionDate: DataCollectionExchange.completionDate ?? '',
//         panelMeetingDate: LocationMeasurement?.approvalDetails?.panelAppealMeeting ?? '',
//         panelDecisionDate: LocationMeasurement?.approvalDetails?.panelAppealDecisionDate ?? '',

//         LocationType: MonitoringDetails?.locationType?.type
//           ? { create: { type: MonitoringDetails.locationType.type } }
//           : { create: { type: '' } },

//         generalInfo: {
//           create: {
//             licensee: GeneralInfo.licensee,
//             address: GeneralInfo.address,
//             contactNumber: GeneralInfo.contactNumber,
//             faxNumber: GeneralInfo.faxNumber ?? '',
//             reportDate: GeneralInfo.reportDate ?? new Date().toISOString(),
//             reportRef: GeneralInfo.reportRef,
//             responsiblePosition: GeneralInfo.responsiblePosition ?? '',
//             responsibleDepartment: GeneralInfo.responsibleDepartment ?? '',
//             fmIdScada: GeneralInfo.fmIdScada ?? '',
//             fmIdSwsAssetNo: GeneralInfo.fmIdSwsAssetNo ?? '',
//             siteManagerName: GeneralInfo.siteManagerName ?? '',
//           },
//         },

//         location: MonitoringDetails?.location?.description
//           ? {
//               create: {
//                 region: MonitoringDetails.location.region ?? '',
//                 stpcc: MonitoringDetails.location.stpcc ?? '',
//                 description: MonitoringDetails.location.description,
//                 coordinateN: Number(MonitoringDetails.location.coordinateN) || 0,
//                 coordinateE: Number(MonitoringDetails.location.coordinateE) || 0,
//                 siteDrawingRef: MonitoringDetails.location.siteDrawingRef ?? '',
//                 flowDiagramRef: MonitoringDetails.location.flowDiagramRef ?? '',
//               },
//             }
//           : {
//               create: {
//                 region: '', stpcc: '', description: '', coordinateN: 0, coordinateE: 0, siteDrawingRef: '', flowDiagramRef: ''
//               },
//             },

//         flowMeasurement: {
//           create: {
//             selectedOption: FlowmeterDetails?.flowMonitoring?.selectedOption ?? 'cumulativeFlow'
//           },
//         },

//         flowRegister: {
//           create: {
//             inventory: { connect: { id: inventory.id } },
//             installation: { connect: { id: installation.id } },
//             maintenance: { connect: { id: maintenance.id } },
//           },
//         },

//         data: {
//           create: {
//             manualMethod: DataCollectionExchange?.data?.manualMethod ?? '',
//             dataLogger: DataCollectionExchange?.data?.dataLogger ?? '',
//             remoteReading: DataCollectionExchange?.data?.remoteReading ?? '',
//             outstationDetails: DataCollectionExchange?.data?.outstationDetails ?? '',
//             storageDetails: DataCollectionExchange?.data?.storageDetails ?? '',
//             ubReport: DataCollectionExchange?.data?.ubReport ?? '',
//             ubValue: DataCollectionExchange?.data?.ubValue ?? '',
//             dataManagementProcedure: DataCollectionExchange?.data?.dataManagementProcedure ?? '',
//           },
//         },

//         maf: {
//           create: {
//             detail: DataCollectionExchange?.maf?.detail ?? '',
//             sopRef: DataCollectionExchange?.maf?.sopRef ?? '',
//             selectionSummary: DataCollectionExchange?.maf?.selectionSummary ?? '',
//           },
//         },

//         attachments: {
//           create: (DataCollectionExchange?.attachments ?? []).map((att: any) => ({
//             type: att.type ?? '',
//             filePath: att.filePath ?? '',
//             uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date(),
//           })),
//         },
//       },
//       include: {
//         LocationType: true,
//         generalInfo: true,
//         location: true,
//         flowMeasurement: true,
//         flowRegister: { include: { inventory: true, installation: true, maintenance: true } },
//         data: true,
//         maf: true,
//         attachments: true,
//       },
//     });

//     res.status(201).json(rfp);
//   } catch (err: any) {
//     console.error('❌ createFullRfp error:', err);
//     res.status(500).json({ error: err.message || 'Internal server error' });
//   }
// };