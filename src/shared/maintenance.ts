export type MaintenanceTask = {
  id: string;
  kind: 'replace_battery' | 'check_offline' | 'verify_device';
  summary: string;
  description: string;
  due: string | null;
  device: {
    name: string;
    area: string | null;
    level: number | null;
    batteryType: string | null;
    quantity: number | null;
    status: string;
    action: string;
    evidenceUpdatedAt: string | null;
  };
};

export type MaintenanceResponse = {
  observedAt: string | null;
  checkedAt: string;
  sourceAvailable: boolean;
  tasks: MaintenanceTask[];
};
