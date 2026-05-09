export type MaintenanceType = 'Vidange' | 'Freins' | 'Pneus' | 'Révision' | 'Contrôle Tech.' | 'Assurance' | 'Vignette' | 'Carburant' | 'Lavage' | 'Autre';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: string;
  mileage: string;
  imageUri: string | null;
  reminder: string;
  engineType: string;
  oilInterval: number; // in km
  insuranceExpiry?: string;
  ctExpiry?: string;
  vignetteExpiry?: string;
  fuelType?: 'Essence' | 'Diesel' | 'Electrique' | 'GPL' | 'Hybride';
  averageConsumption?: number;
  ownerId: string;
  collaborators?: string[];
}

export interface FuelEntry {
  id: string;
  vehicleId: string;
  date: string;
  amount: number; // liters/kWh
  cost: number;
  pricePerUnit: number;
  mileage: string;
}

export interface SafetyCheck {
  id: string;
  vehicleId: string;
  date: string;
  items: {
    tires: boolean;
    lights: boolean;
    liquids: boolean;
    brakes: boolean;
  };
}

export interface MaintenanceLog {
  id: string;
  vehicleId: string;
  type: MaintenanceType;
  date: string;
  mileage: string;
  cost: number;
  notes: string;
}

export interface DiagnosticEntry {
  id: string;
  vehicleId: string;
  date: string;
  codes?: string[];
  description: string;
  recommendation: string;
  severity: 'low' | 'medium' | 'high';
}

export const CAR_MAKES = [
  'Audi', 'BMW', 'Citroën', 'Dacia', 'Fiat', 'Ford', 'Honda', 
  'Mercedes-Benz', 'Nissan', 'Peugeot', 'Renault', 'Toyota', 'Volkswagen'
];

export const MAINTENANCE_TYPES: MaintenanceType[] = [
  'Vidange', 'Freins', 'Pneus', 'Révision', 'Contrôle Tech.', 'Assurance', 'Vignette', 'Carburant', 'Lavage', 'Autre'
];
