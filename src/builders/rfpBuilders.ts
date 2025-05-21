// rfpBuilders.ts - Safe Builders for RFP Project

import { Prisma } from '@prisma/client';

export function buildGeneralInfo(data: any): Prisma.GeneralInfoCreateWithoutRfpInput {
  return {
    licensee: data.licensee ?? '',
    address: data.address ?? '',
    contactNumber: data.contactNumber ?? '',
    reportDate: typeof data.reportDate === 'string' ? data.reportDate : '',
    reportRef: data.reportRef ?? '',
    responsiblePosition: data.responsiblePosition ?? '',
    responsibleDepartment: data.responsibleDepartment ?? '',
    fmIdScada: data.fmIdScada ?? '',
    fmIdSwsAssetNo: data.fmIdSwsAssetNo ?? '',
    siteManagerName: data.siteManagerName || undefined,
    faxNumber: data.faxNumber || undefined,
  };
}

export function buildInventory(data: any): Prisma.InventoryCreateInput {
  return {
    make: data.make ?? '',
    type: data.type ?? '',
    model: data.model ?? '',
    serial: data.serial ?? '',
    fmSize: data.fmSize ?? '',
    pipelineSize: data.pipelineSize ?? '',
    velocityRange: data.velocityRange ?? '',
    accuracyReading: data.accuracyReading ?? '',
    accuracyFullScale: data.accuracyFullScale ?? '',
    readingMethod: data.readingMethod ?? '',
  };
}

export function buildInstallation(data: any): Prisma.InstallationCreateInput {
  return {
    meterInstallDate: data.meterInstallDate || '',
    meterRemovalDate: data.meterRemovalDate || '',
    hydraulicUpstream: data.hydraulicUpstream || undefined,
    hydraulicDownstream: data.hydraulicDownstream || undefined,
    environmental: data.environmental || undefined,
    onSiteTesting: data.onSiteTesting || undefined,
    safetyRisks: data.safetyRisks || undefined,
    securityOfLocation: data.securityOfLocation || undefined,
  };
}

export function buildMaintenance(data: any): Prisma.MaintenanceCreateInput {
  return {
    maintenanceRef: !!data.maintenanceRef,
    preventativeScheduleRef: !!data.preventativeScheduleRef,
  };
}
