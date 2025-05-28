// rfpController.ts

import { Request, Response } from 'express';
import prisma from '../prismaClient';

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
    } = req.body;

    const { typeOfRfp, rfpReference } = BasicInformation;

    if (!rfpReference?.trim()) {
      res.status(400).json({ error: 'rfpReference is required.' }); 
    }

    const duplicate = await prisma.rfp.findUnique({ where: { RfpReference: rfpReference } });
   if (duplicate) {
  res.status(409).json({ error: `Duplicate RfpReference: ${rfpReference}` });
  return; // <-- REQUIRED to prevent continuing
}

    if (!GeneralInfo?.licensee?.trim()) {
      res.status(400).json({ error: 'Licensee is required in GeneralInfo.' });return;
    }

    const inventory = FlowmeterDetails?.flowMonitoring?.inventory
      ? await prisma.inventory.create({ data: FlowmeterDetails.flowMonitoring.inventory })
      : await prisma.inventory.create({
          data: {
            make: '', type: '', model: '', serial: '',
            fmSize: '', pipelineSize: '', velocityRange: '',
            accuracyReading: '', accuracyFullScale: '', readingMethod: ''
          }
        });

    const installation = FlowmeterDetails?.flowMonitoring?.installation
      ? await prisma.installation.create({ data: FlowmeterDetails.flowMonitoring.installation })
      : await prisma.installation.create({
          data: {
            meterInstallDate: '',
            meterRemovalDate: '',
            hydraulicUpstream: '',
            hydraulicDownstream: '',
            environmental: '',
            onSiteTesting: '',
            safetyRisks: '',
            securityOfLocation: ''
          }
        });

    const maintenance = FlowmeterDetails?.flowMonitoring?.maintenance
      ? await prisma.maintenance.create({ data: FlowmeterDetails.flowMonitoring.maintenance })
      : await prisma.maintenance.create({ data: { maintenanceRef: false, preventativeScheduleRef: false } });

    const rfp = await prisma.rfp.create({
      data: {
        typeOfRfp,
        RfpReference: rfpReference,
        startDate: DataCollectionExchange.startDate ?? '',
        completionDate: DataCollectionExchange.completionDate ?? '',
        panelMeetingDate: LocationMeasurement?.approvalDetails?.panelAppealMeeting ?? '',
        panelDecisionDate: LocationMeasurement?.approvalDetails?.panelAppealDecisionDate ?? '',

        LocationType: MonitoringDetails?.locationType?.type
          ? { create: { type: MonitoringDetails.locationType.type } }
          : { create: { type: '' } },

        generalInfo: {
          create: {
            licensee: GeneralInfo.licensee,
            address: GeneralInfo.address,
            contactNumber: GeneralInfo.contactNumber,
            faxNumber: GeneralInfo.faxNumber ?? '',
            reportDate: GeneralInfo.reportDate ?? new Date().toISOString(),
            reportRef: GeneralInfo.reportRef,
            responsiblePosition: GeneralInfo.responsiblePosition ?? '',
            responsibleDepartment: GeneralInfo.responsibleDepartment ?? '',
            fmIdScada: GeneralInfo.fmIdScada ?? '',
            fmIdSwsAssetNo: GeneralInfo.fmIdSwsAssetNo ?? '',
            siteManagerName: GeneralInfo.siteManagerName ?? '',
          },
        },

        location: MonitoringDetails?.location?.description
          ? {
              create: {
                region: MonitoringDetails.location.region ?? '',
                stpcc: MonitoringDetails.location.stpcc ?? '',
                description: MonitoringDetails.location.description,
                coordinateN: Number(MonitoringDetails.location.coordinateN) || 0,
                coordinateE: Number(MonitoringDetails.location.coordinateE) || 0,
                siteDrawingRef: MonitoringDetails.location.siteDrawingRef ?? '',
                flowDiagramRef: MonitoringDetails.location.flowDiagramRef ?? '',
              },
            }
          : {
              create: {
                region: '', stpcc: '', description: '', coordinateN: 0, coordinateE: 0, siteDrawingRef: '', flowDiagramRef: ''
              },
            },

        flowMeasurement: {
          create: {
            selectedOption: FlowmeterDetails?.flowMonitoring?.selectedOption ?? 'cumulativeFlow'
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
          create: {
            manualMethod: DataCollectionExchange?.data?.manualMethod ?? '',
            dataLogger: DataCollectionExchange?.data?.dataLogger ?? '',
            remoteReading: DataCollectionExchange?.data?.remoteReading ?? '',
            outstationDetails: DataCollectionExchange?.data?.outstationDetails ?? '',
            storageDetails: DataCollectionExchange?.data?.storageDetails ?? '',
            ubReport: DataCollectionExchange?.data?.ubReport ?? '',
            ubValue: DataCollectionExchange?.data?.ubValue ?? '',
            dataManagementProcedure: DataCollectionExchange?.data?.dataManagementProcedure ?? '',
          },
        },

        maf: {
          create: {
            detail: DataCollectionExchange?.maf?.detail ?? '',
            sopRef: DataCollectionExchange?.maf?.sopRef ?? '',
            selectionSummary: DataCollectionExchange?.maf?.selectionSummary ?? '',
          },
        },

        attachments: {
          create: (DataCollectionExchange?.attachments ?? []).map((att: any) => ({
            type: att.type ?? '',
            filePath: att.filePath ?? '',
            uploadedAt: att.uploadedAt ? new Date(att.uploadedAt) : new Date(),
          })),
        },
      },
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

    res.status(201).json(rfp);
  } catch (err: any) {
    console.error('❌ createFullRfp error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
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
        attachments: true,
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
        attachments: true,
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
    const existing = await prisma.rfp.findUnique({ where: { id: Number(id) } });

    if (!existing) {
    res.status(404).json({ error: 'RFP not found' });
    }

    await prisma.rfp.delete({ where: { id: Number(id) } });

    res.status(200).json({ message: 'RFP deleted successfully' });

  } catch (err: any) {
    console.error('❌ deleteRfp error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

export const patchRfp =async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const patchData = req.body;

    const existing = await prisma.rfp.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      res.status(404).json({ error: 'RFP not found' });
    }

    const updated = await prisma.rfp.update({
      where: { id: Number(id) },
      data: patchData,
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

     res.status(200).json(updated);

  } catch (err: any) {
    console.error('❌ patchRfp error:', err);
   res.status(500).json({ error: err.message || 'Internal server error' });
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
