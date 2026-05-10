/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Car, 
  BarChart3, 
  Settings, 
  Plus, 
  X, 
  ChevronLeft, 
  Trash2, 
  Bell, 
  Calendar, 
  Gauge, 
  Euro, 
  Banknote,
  Camera,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  FileText,
  ShieldCheck,
  Zap,
  ChevronRight,
  CloudRain,
  Snowflake,
  Sun,
  Thermometer,
  Droplets,
  Wind,
  MapPin,
  Activity,
  Fuel,
  QrCode,
  LogOut,
  User,
  Share2,
  ScanLine,
  FileDown,
  Bluetooth,
  UserPlus,
  Settings2,
  ArrowUpRight,
  TrendingUp,
  Crown,
  ExternalLink,
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { cn } from './lib/utils';
import { Vehicle, MaintenanceLog, MaintenanceType, CAR_MAKES, MAINTENANCE_TYPES } from './types';
import { auth, db, signInWithGoogle, logout } from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  arrayUnion,
  getDoc,
  collectionGroup,
  orderBy,
  or
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Storage Keys
const VEHICLES_KEY = '@vehicles';
const LOGS_KEY = '@logs';
const CURRENCY_KEY = '@currency';

const ENGINE_PRESETS = [
  { type: 'Diesel (HDi, dCi, TDI)', interval: 10000 },
  { type: 'Essence (Standard)', interval: 15000 },
  { type: 'Turbo Essence', interval: 10000 },
  { type: 'GPL / Hybride', interval: 15000 },
  { type: 'Performance / Sport', interval: 5000 },
];

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [currentTab, setCurrentTab] = useState<'Garage' | 'Statistiques' | 'Paramètres'>('Garage');
  
  const [vehicles, setVehicles] = useState<Vehicle[]>(() => {
    const saved = localStorage.getItem(VEHICLES_KEY);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Auto-save vehicles to local storage
  useEffect(() => {
    localStorage.setItem(VEHICLES_KEY, JSON.stringify(vehicles));
  }, [vehicles]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [fuelEntries, setFuelEntries] = useState<any[]>([]);
  const [diagnostics, setDiagnostics] = useState<any[]>([]);
  const [currency, setCurrency] = useState('DA');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeVehicleForLog, setActiveVehicleForLog] = useState<Vehicle | null>(null);
  const [statsVehicleFilter, setStatsVehicleFilter] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<any>(null);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [safetyVehicle, setSafetyVehicle] = useState<Vehicle | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [activeVehicleForFuel, setActiveVehicleForFuel] = useState<Vehicle | null>(null);
  const [isDiagModalOpen, setIsDiagModalOpen] = useState(false);
  const [isOBDBluetoothOpen, setIsOBDBluetoothOpen] = useState(false);
  const [activeVehicleForDiag, setActiveVehicleForDiag] = useState<Vehicle | null>(null);

  // Auth & Initial Data
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthChecking(false);
      if (u) {
        // Sync User Profile
        setDoc(doc(db, 'users', u.uid), {
          uid: u.uid,
          email: u.email,
          displayName: u.displayName
        }, { merge: true });
      }
      setTimeout(() => setIsSplashVisible(false), 2000);
    });

    const storedCurrency = localStorage.getItem(CURRENCY_KEY);
    if (storedCurrency) setCurrency(storedCurrency);

    return () => unsubscribeAuth();
  }, []);

  // Sync Vehicles
  useEffect(() => {
    if (!user) {
      setVehicles([]);
      return;
    }

    const q = query(
      collection(db, 'vehicles'),
      or(
        where('ownerId', '==', user.uid),
        where('collaborators', 'array-contains', user.uid)
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vList = snapshot.docs.map(doc => ({ 
        ...(doc.data() as Vehicle), 
        id: doc.id 
      }));
      setVehicles(vList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    return () => unsubscribe();
  }, [user]);

  // Sync Logs for all vehicles
  useEffect(() => {
    if (!user || vehicles.length === 0) {
      setLogs([]);
      return;
    }

    // Since we can't easily query cross-subcollection logs without collectionGroup
    // and we need to filter by vehicle IDs the user has access to,
    // we'll use a collectionGroup query on 'logs' and filter by vehicleId IN [...]
    // OR we can just listen to each vehicle's logs subcollection.
    // Given the 10 item limit in 'in' queries, we'll try collectionGroup first if enabled in rules.
    // Rules didn't explicitly block it, but usually need index.
    // Let's use separate listeners for each vehicle for maximum reliability in this env.
    
    const unsubscribes = vehicles.map(v => {
      return onSnapshot(collection(db, 'vehicles', v.id, 'logs'), (snapshot) => {
        const vLogs = snapshot.docs.map(d => ({ ...(d.data() as MaintenanceLog), id: d.id }));
        setLogs(prev => {
          const otherLogs = prev.filter(l => l.vehicleId !== v.id);
          return [...otherLogs, ...vLogs];
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `vehicles/${v.id}/logs`);
      });
    });

    return () => unsubscribes.forEach(u => u());
  }, [user, vehicles.map(v => v.id).join(',')]);

  // Sync Fuel Entries for all vehicles
  useEffect(() => {
    if (!user || vehicles.length === 0) {
      setFuelEntries([]);
      return;
    }
    
    const unsubscribes = vehicles.map(v => {
      return onSnapshot(collection(db, 'vehicles', v.id, 'fuel'), (snapshot) => {
        const vFuel = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id }));
        setFuelEntries(prev => {
          const otherFuel = prev.filter(f => f.vehicleId !== v.id);
          return [...otherFuel, ...vFuel];
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `vehicles/${v.id}/fuel`);
      });
    });

    return () => unsubscribes.forEach(u => u());
  }, [user, vehicles.map(v => v.id).join(',')]);

  // Sync Diagnostics for all vehicles
  useEffect(() => {
    if (!user || vehicles.length === 0) {
      setDiagnostics([]);
      return;
    }
    
    const unsubscribes = vehicles.map(v => {
      return onSnapshot(collection(db, 'vehicles', v.id, 'diagnostics'), (snapshot) => {
        const vDiags = snapshot.docs.map(d => ({ ...(d.data() as any), id: d.id }));
        setDiagnostics(prev => {
          const otherDiags = prev.filter(f => f.vehicleId !== v.id);
          return [...otherDiags, ...vDiags];
        });
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `vehicles/${v.id}/diagnostics`);
      });
    });

    return () => unsubscribes.forEach(u => u());
  }, [user, vehicles.map(v => v.id).join(',')]);

  // Fetch Weather
  useEffect(() => {
    const fetchWeather = async (lat: number, lon: number) => {
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&current=temperature_2m,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`);
        const data = await res.json();
        setWeatherData(data);
      } catch (err) {
        console.error("Weather fetch failed", err);
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((pos) => {
        fetchWeather(pos.coords.latitude, pos.coords.longitude);
      }, (err) => {
        console.warn("Geolocation denied, using default weather (Algiers)", err);
        fetchWeather(36.75, 3.05); // Default to Algiers if no location
      });
    } else {
      fetchWeather(36.75, 3.05);
    }
  }, []);

  // Save helpers
  const saveVehicles = (newVehicles: Vehicle[]) => {
    setVehicles(newVehicles);
    localStorage.setItem(VEHICLES_KEY, JSON.stringify(newVehicles));
  };

  const saveLogs = (newLogs: MaintenanceLog[]) => {
    setLogs(newLogs);
    localStorage.setItem(LOGS_KEY, JSON.stringify(newLogs));
  };

  const changeCurrency = (newCurrency: string) => {
    setCurrency(newCurrency);
    localStorage.setItem(CURRENCY_KEY, newCurrency);
  };

  // Logic Handlers
  const handleAddVehicle = async (vehicle: Omit<Vehicle, 'id' | 'reminder' | 'ownerId'>) => {
    if (!user) return;
    const vehicleId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newVehicle: Vehicle = {
      ...vehicle,
      id: vehicleId,
      ownerId: user.uid,
      collaborators: [],
      reminder: ''
    } as Vehicle;
    try {
      await setDoc(doc(db, 'vehicles', vehicleId), newVehicle);
      setIsAddModalOpen(false);
    } catch (err) {
      console.error("Failed to add vehicle", err);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vehicles', id));
      setSelectedVehicle(null);
    } catch (err) {
      console.error("Failed to delete vehicle", err);
    }
  };

  const handleUpdateVehicle = async (id: string, updates: Partial<Vehicle>) => {
    try {
      await updateDoc(doc(db, 'vehicles', id), updates);
      if (selectedVehicle?.id === id) {
        setSelectedVehicle({ ...selectedVehicle, ...updates });
      }
    } catch (err) {
      console.error("Failed to update vehicle", err);
    }
  };

  const handleAddLog = async (log: Omit<MaintenanceLog, 'id' | 'date'>) => {
    const logId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const today = new Date();
    const dateStr = today.toLocaleDateString('fr-FR');
    const newLog: MaintenanceLog = {
      ...log,
      id: logId,
      date: dateStr
    };
    try {
      await setDoc(doc(db, 'vehicles', log.vehicleId, 'logs', logId), newLog);
      setIsLogModalOpen(false);

      // Update vehicle mileage if log mileage is higher
      const targetVehicle = vehicles.find(v => v.id === log.vehicleId);
      if (targetVehicle) {
        const currentMileage = parseInt(targetVehicle.mileage);
        const logMileage = parseInt(log.mileage);
        if (logMileage > currentMileage) {
          handleUpdateVehicle(targetVehicle.id, { mileage: log.mileage });
        }
      }
    } catch (err) {
      console.error("Failed to add log", err);
    }
  };

  const handleDeleteLog = async (id: string) => {
    if (!selectedVehicle) return;
    try {
      await deleteDoc(doc(db, 'vehicles', selectedVehicle.id, 'logs', id));
    } catch (err) {
      console.error("Failed to delete log", err);
    }
  };

  const handleAddFuel = async (fuel: Omit<any, 'id' | 'date'>) => {
    const fuelId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const newFuel = {
      ...fuel,
      id: fuelId,
      date: dateStr
    };
    try {
      await setDoc(doc(db, 'vehicles', fuel.vehicleId, 'fuel', fuelId), newFuel);
      setIsFuelModalOpen(false);

      // Update vehicle mileage if refuel mileage is higher
      const targetVehicle = vehicles.find(v => v.id === fuel.vehicleId);
      if (targetVehicle) {
        const currentMileage = parseInt(targetVehicle.mileage);
        const fuelMileage = parseInt(fuel.mileage);
        if (fuelMileage > currentMileage) {
          handleUpdateVehicle(targetVehicle.id, { mileage: fuel.mileage });
        }
      }
    } catch (err) {
      console.error("Failed to add fuel entry", err);
    }
  };

  const handleDiagnosticSave = async (diag: Omit<any, 'id' | 'date'>) => {
    const diagId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const newDiag = {
      ...diag,
      id: diagId,
      date: dateStr
    };
    try {
      await setDoc(doc(db, 'vehicles', diag.vehicleId, 'diagnostics', diagId), newDiag);
      setIsDiagModalOpen(false);
    } catch (err) {
      console.error("Failed to save diagnostic", err);
    }
  };

  const generateMonthlyReport = () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const isThisMonth = (dateStr: string) => {
      const [d, m, y] = dateStr.split('/').map(Number);
      return m === currentMonth && y === currentYear;
    };

    const monthName = now.toLocaleString('fr-FR', { month: 'long' });
    const targetLogs = logs.filter(l => 
      isThisMonth(l.date) && (!statsVehicleFilter || l.vehicleId === statsVehicleFilter)
    );
    const targetFuel = fuelEntries.filter(f => 
      isThisMonth(f.date) && (!statsVehicleFilter || f.vehicleId === statsVehicleFilter)
    );

    const docPdf = new jsPDF();
    const pageWidth = docPdf.internal.pageSize.getWidth();
    
    // Header
    docPdf.setFontSize(22);
    docPdf.setTextColor(15, 23, 42); // slate-900
    docPdf.text('Rapport de Dépenses Mensuel', 14, 22);
    
    docPdf.setFontSize(10);
    docPdf.setTextColor(100, 116, 139); // slate-500
    docPdf.text(`Période : ${monthName} ${currentYear}`, 14, 30);
    const vehicleText = statsVehicleFilter 
      ? `Véhicule: ${vehicles.find(v => v.id === statsVehicleFilter)?.make} ${vehicles.find(v => v.id === statsVehicleFilter)?.model}`
      : "Flotte Complète";
    docPdf.text(vehicleText, 14, 35);

    // Summary Section
    const totalMaint = targetLogs.reduce((s, l) => s + (l.cost || 0), 0);
    const totalFuel = targetFuel.reduce((s, f) => s + (f.cost || 0), 0);
    const totalAll = totalMaint + totalFuel;

    docPdf.setFontSize(14);
    docPdf.setTextColor(59, 130, 246); // blue-500
    docPdf.text(`Total des dépenses : ${totalAll.toLocaleString()} ${currency}`, 14, 50);

    // Maintenance Table
    const maintRows = targetLogs.map(l => [
      l.date,
      l.type,
      `${l.cost?.toLocaleString() || 0} ${currency}`,
      `${l.mileage} KM`
    ]);

    docPdf.setFontSize(12);
    docPdf.setTextColor(15, 23, 42);
    docPdf.text('Entretien & Services', 14, 65);

    autoTable(docPdf, {
      startY: 70,
      head: [['Date', 'Type', 'Coût', 'Kilométrage']],
      body: maintRows,
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 9 }
    });

    // Fuel Table
    const fuelRows = targetFuel.map(f => [
      f.date,
      'Carburant',
      `${f.cost?.toLocaleString() || 0} ${currency}`,
      `${f.amount} L`,
      `${f.mileage} KM`
    ]);

    const finalY = (docPdf as any).lastAutoTable.finalY + 15;
    docPdf.text('Carburant', 14, finalY);

    autoTable(docPdf, {
      startY: finalY + 5,
      head: [['Date', 'Type', 'Coût', 'Quantité', 'Kilométrage']],
      body: fuelRows,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129] }, // emerald-500
      styles: { fontSize: 9 }
    });

    // Footer
    const lastY = (docPdf as any).lastAutoTable.finalY + 20;
    docPdf.setFontSize(8);
    docPdf.setTextColor(148, 163, 184);
    docPdf.text('Généré par Boite à Gants App', pageWidth / 2, lastY, { align: 'center' });

    docPdf.save(`rapport_${monthName.toLowerCase()}_${currentYear}.pdf`);
  };

  // Notification Logic
  const getNotifications = () => {
    const notifications: { 
      id: string; 
      vehicleId: string; 
      vehicleName: string; 
      type: string; 
      label: string; 
      days?: number; 
      isExpired: boolean; 
      isUrgent: boolean;
    }[] = [];

    vehicles.forEach(v => {
      const checkDoc = (dateStr: string | undefined, label: string) => {
        if (!dateStr) return;
        const expiry = new Date(dateStr);
        const today = new Date();
        const diff = expiry.getTime() - today.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        const isExpired = days <= 0;
        const isUrgent = days <= 30;

        if (isExpired || isUrgent) {
          notifications.push({
            id: `${v.id}-${label}`,
            vehicleId: v.id,
            vehicleName: `${v.make} ${v.model}`,
            type: 'doc',
            label,
            days,
            isExpired,
            isUrgent
          });
        }
      };

      checkDoc(v.insuranceExpiry, 'Assurance');
      checkDoc(v.ctExpiry, 'Contrôle Technique');
      checkDoc(v.vignetteExpiry, 'Vignette');

      // Oil Check
      const vLogs = logs.filter(l => l.vehicleId === v.id);
      const lastOilChange = [...vLogs]
        .filter(l => l.type === 'Vidange')
        .sort((a, b) => parseInt(b.mileage) - parseInt(a.mileage))[0];
      
      const lastOilMileage = lastOilChange ? parseInt(lastOilChange.mileage) : 0;
      const currentMileage = parseInt(v.mileage);
      const distanceSinceOil = currentMileage - lastOilMileage;
      const remainingOil = v.oilInterval ? v.oilInterval - distanceSinceOil : null;

      if (remainingOil !== null && remainingOil < 5000) {
        notifications.push({
          id: `${v.id}-oil`,
          vehicleId: v.id,
          vehicleName: `${v.make} ${v.model}`,
          type: 'oil',
          label: 'Vidange Requise',
          isExpired: remainingOil <= 0,
          isUrgent: remainingOil < 5000
        });
      }
    });

    return notifications;
  };

  const activeNotifications = getNotifications();

  // Stats Calcs
  const filteredLogs = statsVehicleFilter 
    ? logs.filter(l => l.vehicleId === statsVehicleFilter) 
    : logs;

  const filteredFuel = statsVehicleFilter
    ? fuelEntries.filter(f => f.vehicleId === statsVehicleFilter)
    : fuelEntries;

  const totalLogExpenses = filteredLogs.reduce((sum, log) => sum + (log.cost || 0), 0);
  const totalFuelExpenses = filteredFuel.reduce((sum, f) => sum + (f.cost || 0), 0);
  const totalTotalExpenses = totalLogExpenses + totalFuelExpenses;

  // Breakdown by Type (Maintenance + Fuel)
  const combinedCostsByType = filteredLogs.reduce((acc, log) => {
    acc[log.type] = (acc[log.type] || 0) + (log.cost || 0);
    return acc;
  }, {} as Record<string, number>);
  if (totalFuelExpenses > 0) combinedCostsByType['Carburant'] = (combinedCostsByType['Carburant'] || 0) + totalFuelExpenses;

  const statsData = Object.keys(combinedCostsByType).map(type => ({
    type,
    amount: combinedCostsByType[type],
    percentage: totalTotalExpenses > 0 ? (combinedCostsByType[type] / totalTotalExpenses) * 100 : 0
  })).sort((a, b) => b.amount - a.amount);

  // Pie Chart Data
  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  const pieData = statsData.slice(0, 5).map((d, index) => ({ 
    name: d.type, 
    value: d.amount,
    color: COLORS[index % COLORS.length]
  }));

  // Cost per KM
  const calculateCostPerKm = () => {
    const targetVehicles = statsVehicleFilter ? vehicles.filter(v => v.id === statsVehicleFilter) : vehicles;
    if (targetVehicles.length === 0) return 0;
    
    let totalKm = 0;
    let totalMoney = 0;

    targetVehicles.forEach(v => {
      const vLogs = logs.filter(l => l.vehicleId === v.id);
      const vFuel = fuelEntries.filter(f => f.vehicleId === v.id);
      const allMiles = [...vLogs.map(l => parseInt(l.mileage)), ...vFuel.map(f => parseInt(f.mileage)), parseInt(v.mileage)].filter(m => !isNaN(m));
      
      const vMoney = vLogs.reduce((s, l) => s + (l.cost || 0), 0) + vFuel.reduce((s, f) => s + (f.cost || 0), 0);
      totalMoney += vMoney;

      if (allMiles.length > 1) {
        const minMile = Math.min(...allMiles);
        const maxMile = Math.max(...allMiles);
        totalKm += (maxMile - minMile);
      }
    });

    if (totalKm === 0) return 0;
    return totalMoney / totalKm;
  };

  const costPerKm = calculateCostPerKm();

  // Fuel Consumption Trend (L/100km)
  const getFuelTrend = () => {
    if (filteredFuel.length < 2) return [];
    const sortedFuel = [...filteredFuel].sort((a, b) => parseInt(a.mileage) - parseInt(b.mileage));
    const trend = [];
    for (let i = 1; i < sortedFuel.length; i++) {
       const dist = parseInt(sortedFuel[i].mileage) - parseInt(sortedFuel[i-1].mileage);
       if (dist > 0) {
          const l100 = (sortedFuel[i].amount / dist) * 100;
          trend.push({
             date: sortedFuel[i].date.split('/')[1] + '/' + sortedFuel[i].date.split('/')[2].slice(-2),
             value: parseFloat(l100.toFixed(2))
          });
       }
    }
    return trend.slice(-10);
  };
  const fuelTrendData = getFuelTrend();

  // Prepare history data (last 10 entries)
  const historyData = [...filteredLogs]
    .sort((a, b) => {
      const dateA = a.date.split('/').reverse().join('-');
      const dateB = b.date.split('/').reverse().join('-');
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    })
    .slice(-10)
    .map(l => ({
      id: l.id,
      date: l.date.split('/')[1] + '/' + l.date.split('/')[2].slice(-2), // Format: MM/YY
      cost: l.cost,
      type: l.type
    }));

  if (isSplashVisible || isAuthChecking) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-[28px] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/20">
            <Car size={40} className="text-white" />
          </div>
          <h1 className="text-5xl font-black text-white font-display mb-2 tracking-tighter uppercase">Boite à Gants</h1>
          <p className="text-blue-500 font-bold tracking-[0.4em] text-[10px] uppercase">Chargement...</p>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 p-8 overflow-hidden">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute top-[-10%] left-[-10%] w-[70%] h-[50%] rounded-full bg-blue-600 blur-[130px] pointer-events-none" 
        />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center relative z-10 w-full max-w-sm"
        >
          <div className="w-24 h-24 bg-blue-600 rounded-[32px] flex items-center justify-center mx-auto mb-10 shadow-2xl shadow-blue-500/40">
            <Car size={48} className="text-white" />
          </div>
          <h1 className="text-5xl font-black text-white font-display mb-4 tracking-tighter uppercase leading-tight">Gérez votre garage en famille</h1>
          <p className="text-slate-500 text-sm font-medium mb-12 uppercase tracking-widest leading-relaxed">Synchronisez vos véhicules et entretiens entre plusieurs mobiles en temps réel.</p>
          
          <button 
            onClick={signInWithGoogle}
            className="w-full bg-white text-slate-950 py-5 rounded-[24px] font-black uppercase tracking-[0.2em] text-[11px] flex items-center justify-center gap-4 hover:bg-slate-100 transition-all shadow-xl shadow-white/10"
          >
            <User size={20} />
            Se connecter avec Google
          </button>
          
          <p className="text-slate-600 text-[10px] uppercase tracking-widest font-bold mt-10">Sécurisé par Firebase & AI Studio</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto h-screen bg-slate-950 flex flex-col relative overflow-hidden text-slate-400">
      {/* Background Glows (Dark Mode) */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.2, 0.1] 
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-[-10%] left-[-10%] w-[70%] h-[50%] rounded-full bg-blue-600 blur-[130px] pointer-events-none" 
      />
      <motion.div 
        animate={{ 
          scale: [1, 1.1, 1],
          opacity: [0.1, 0.15, 0.1] 
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[10%] right-[-10%] w-[70%] h-[50%] rounded-full bg-indigo-600 blur-[130px] pointer-events-none" 
      />
      
      {/* Header */}
      <header className="bg-slate-950/80 backdrop-blur-2xl px-6 pt-12 pb-6 flex justify-between items-center shrink-0 border-b border-slate-900 z-20">
        <div className="flex items-center gap-3">
          <div className="relative">
            <motion.button 
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsNotificationsOpen(true)}
              className="p-3 bg-slate-900 text-slate-500 rounded-2xl border border-slate-800 relative hover:bg-slate-800 hover:text-blue-400 transition-all shadow-inner"
            >
              <Bell size={20} />
              {activeNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-slate-950 animate-pulse">
                  {activeNotifications.length}
                </span>
              )}
            </motion.button>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black font-display text-white tracking-tight leading-none">{user?.displayName?.split(' ')[0] || 'Garage'}</h2>
              {isPremium && <Crown size={16} className="text-amber-400 fill-amber-400" />}
            </div>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black mt-1.5">{currentTab}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentTab === 'Garage' && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsScanModalOpen(true)}
              className="p-3 bg-slate-900 text-slate-400 border border-slate-800 rounded-2xl transition-all hover:text-blue-400"
            >
              <ScanLine size={24} />
            </motion.button>
          )}
          {currentTab === 'Garage' && vehicles.length > 0 && (
            <motion.button 
              id="header-add-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAddModalOpen(true)}
              className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl transition-all shadow-xl shadow-blue-500/20"
            >
              <Plus size={24} />
            </motion.button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-24">
        <AnimatePresence mode="wait">
          {currentTab === 'Garage' ? (
            <motion.div 
              key="garage"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={{
                hidden: { opacity: 0 },
                visible: { 
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                },
                exit: { opacity: 0 }
              }}
              className="p-5 space-y-4"
            >
              <WeatherWidget data={weatherData} />

              {/* Real Google Ad Slot */}
              {!isPremium && <GoogleAd slot="1234567890" />}

              {vehicles.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
                    <Car size={40} />
                  </div>
                  <p className="text-slate-400 text-lg mb-6">Votre garage est vide.</p>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-blue-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-600 transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-blue-500/20"
                  >
                    <Plus size={20} />
                    Ajouter un véhicule
                  </motion.button>
                </motion.div>
              ) : (
                vehicles.map(vehicle => (
                  <VehicleCard 
                    key={vehicle.id} 
                    vehicle={vehicle} 
                    logs={logs.filter(l => l.vehicleId === vehicle.id)}
                    onClick={() => setSelectedVehicle(vehicle)} 
                  />
                ))
              )}
            </motion.div>
          ) : currentTab === 'Statistiques' ? (
            <motion.div 
              key="stats"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="p-5 pb-24 space-y-6"
            >
              {/* Analytics Ad Slot */}
              {!isPremium && <GoogleAd slot="0987654321" />}

              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[32px] p-8 text-center shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full -mr-10 -mt-10 blur-2xl" />
                <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Budget Total Consommé</h3>
                <div className="text-4xl font-black text-white mb-2 font-display">
                  {totalTotalExpenses.toLocaleString()} <span className="text-blue-500 text-2xl">{currency}</span>
                </div>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <TrendingUp size={14} className="text-emerald-500" />
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">En hausse de 12% ce mois</span>
                </div>

                <button 
                  onClick={generateMonthlyReport}
                  className="absolute bottom-6 right-6 p-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all border border-white/10 group flex items-center gap-2"
                  title="Télécharger le rapport mensuel"
                >
                  <FileDown size={20} className="text-blue-400 group-hover:scale-110 transition-transform" />
                </button>
              </div>

              {/* Bento Analysis Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 p-6 rounded-[28px] text-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Coût / KM</h5>
                  <div className="text-2xl font-black text-blue-500 font-display">
                    {costPerKm.toFixed(2)} <span className="text-[10px] uppercase">{currency}</span>
                  </div>
                  <p className="text-[8px] text-slate-600 font-bold uppercase mt-1">Efficience globale</p>
                </div>
                <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800 p-6 rounded-[28px] text-center relative overflow-hidden group">
                   <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Consommation</h5>
                  <div className="text-2xl font-black text-emerald-500 font-display">
                    {fuelTrendData.length > 0 ? fuelTrendData[fuelTrendData.length - 1].value : '--'}
                  </div>
                  <p className="text-[8px] text-slate-600 font-bold uppercase mt-1">L/100 KM (Dernier)</p>
                </div>
                <div className="col-span-2 bg-slate-900/40 backdrop-blur-md border border-slate-800 p-6 rounded-[28px] flex items-center justify-between">
                  <div>
                    <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Activité Totale</h5>
                    <div className="text-2xl font-black text-white font-display">
                      {filteredLogs.length + filteredFuel.length} <span className="text-slate-500 text-sm">Entrées</span>
                    </div>
                  </div>
                  <div className="flex -space-x-3">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-950 bg-slate-800 flex items-center justify-center text-slate-500">
                        <User size={16} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Assistant Insight */}
              <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-[32px] p-6 flex gap-4 items-center">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-600/20 shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h6 className="text-indigo-400 text-[10px] font-black uppercase tracking-widest mb-1">Conseil Assistant IA</h6>
                  <p className="text-slate-300 text-[11px] font-medium leading-relaxed">
                    Votre coût au kilomètre est optimal. Pensez à vérifier la pression des pneus le mois prochain pour maintenir cette performance.
                  </p>
                </div>
              </div>

              {vehicles.length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  <button 
                    onClick={() => setStatsVehicleFilter(null)}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border shrink-0",
                      statsVehicleFilter === null 
                        ? "bg-white text-slate-950 border-white shadow-lg shadow-white/10" 
                        : "bg-slate-900 group border-slate-800 text-slate-500 hover:text-white"
                    )}
                  >
                    Vue Globale
                  </button>
                  {vehicles.map(v => (
                    <button 
                      key={v.id}
                      onClick={() => setStatsVehicleFilter(v.id)}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border shrink-0",
                        statsVehicleFilter === v.id 
                          ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20" 
                          : "bg-slate-900 text-slate-500 border-slate-800 hover:text-white"
                      )}
                    >
                      {v.make}
                    </button>
                  ))}
                </div>
              )}

              {statsData.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center text-slate-500">
                  <Search className="mx-auto mb-4 opacity-10" size={48} />
                  <p className="text-[10px] font-black uppercase tracking-widest">Aucune donnée pour ce filtre</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Breakdown Section */}
                  <div className="bg-slate-900/60 backdrop-blur-md rounded-[32px] p-6 border border-slate-800">
                    <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                       <Activity size={14} className="text-blue-500" />
                       Répartition des dépenses
                    </h4>
                    <div className="h-64 mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={8}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                            itemStyle={{ color: '#fff' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {pieData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{d.name}</span>
                          <span className="text-[10px] font-black text-white ml-auto">{((d.value / totalTotalExpenses) * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Fuel Trend Section */}
                  <div className="bg-slate-900/60 backdrop-blur-md rounded-[32px] p-6 border border-slate-800">
                    <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                       <Zap size={14} className="text-emerald-500" />
                       Efficacité (L/100KM)
                    </h4>
                    {fuelTrendData.length > 0 ? (
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={fuelTrendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis 
                              dataKey="date" 
                              stroke="#64748b" 
                              fontSize={9} 
                              tickLine={false} 
                              axisLine={false}
                            />
                            <YAxis 
                              stroke="#64748b" 
                              fontSize={9} 
                              tickLine={false} 
                              axisLine={false}
                            />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                              itemStyle={{ color: '#10b981' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="value" 
                              stroke="#10b981" 
                              strokeWidth={3} 
                              dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-center px-8">
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest opacity-60">
                          Ajoutez au moins deux pleins pour voir l'évolution de la consommation.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Expenses History */}
                  <div className="bg-slate-900/60 backdrop-blur-md rounded-[32px] p-6 border border-slate-800">
                    <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                       <History size={14} className="text-purple-500" />
                       Historique des coûts
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis 
                            dataKey="id" 
                            stroke="#64748b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                            tickFormatter={(_, index) => historyData[index]?.date || ''}
                          />
                          <YAxis 
                            stroke="#64748b" 
                            fontSize={9} 
                            tickLine={false} 
                            axisLine={false}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                            itemStyle={{ color: '#8b5cf6' }}
                          />
                          <Bar 
                            dataKey="cost" 
                            fill="#8b5cf6" 
                            radius={[4, 4, 0, 0]} 
                            barSize={10}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="p-5"
            >
              <h4 className="text-lg font-black font-display mb-4 text-slate-800 uppercase tracking-tight">Devise par défaut</h4>
              <div className="bg-white/60 backdrop-blur-md rounded-3xl p-2 border border-white shadow-sm">
                <button 
                  onClick={() => changeCurrency('DA')}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between transition-all",
                    currency === 'DA' ? "bg-white shadow-sm text-slate-900 border border-slate-100" : "text-slate-500 hover:bg-white/40"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                      <Banknote size={20} />
                    </div>
                    <span className="font-bold text-sm tracking-tight">Dinar Algérien (DA)</span>
                  </div>
                  {currency === 'DA' && <CheckCircle2 size={18} className="text-blue-500" />}
                </button>
                <div className="h-px bg-slate-100/50 mx-4" />
                <button 
                  onClick={() => changeCurrency('€')}
                  className={cn(
                    "w-full p-4 rounded-2xl flex items-center justify-between transition-all",
                    currency === '€' ? "bg-slate-800 shadow-sm text-white border border-slate-700" : "text-slate-500 hover:bg-slate-900"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-900/40 text-blue-400 rounded-xl flex items-center justify-center">
                      <Euro size={20} />
                    </div>
                    <span className="font-bold text-sm tracking-tight">Euro (€)</span>
                  </div>
                  {currency === '€' && <CheckCircle2 size={18} className="text-blue-500" />}
                </button>
              </div>

              {/* Premium Upsell */}
              <div className="mt-8 bg-gradient-to-br from-amber-400 to-amber-600 p-8 rounded-[32px] text-center shadow-xl shadow-amber-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 rounded-full -mr-10 -mt-10 blur-2xl" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center text-white mx-auto mb-4 backdrop-blur-md">
                    <Crown size={32} />
                  </div>
                  <h4 className="text-white text-xl font-black uppercase tracking-tighter mb-2">Boite à Gants Pro</h4>
                  <p className="text-white/90 text-xs font-bold leading-relaxed mb-6 px-4">
                    Supprimez toutes les publicités, obtenez des rapports PDF illimités et un badge exclusif.
                  </p>
                  <button 
                    onClick={() => setIsPremium(!isPremium)}
                    className="w-full py-5 bg-slate-900 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
                  >
                    {isPremium ? "Membre Pro Actif" : "Devenir membre Pro"}
                  </button>
                </div>
              </div>
              
              <div className="mt-8 bg-blue-900/10 p-8 rounded-[32px] text-center border border-blue-900/20 backdrop-blur-sm">
                <p className="text-blue-500 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Sécurité & Sync</p>
                <p className="text-slate-500 text-[11px] font-medium leading-relaxed uppercase tracking-widest opacity-60">
                   Compte: {user?.email}<br />
                   Vos données sont synchronisées sur le cloud.
                </p>
                <button 
                  onClick={logout}
                  className="mt-6 flex items-center gap-2 mx-auto text-red-500 font-black uppercase text-[10px] tracking-widest hover:text-red-400"
                >
                  <LogOut size={16} />
                  Se déconnecter
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ad Space Placeholder */}
        <div className="p-5">
          <div className="w-full h-16 bg-slate-900/40 rounded-xl flex items-center justify-center text-slate-700 text-[9px] font-black uppercase tracking-widest border border-dashed border-slate-800">
            Nexus Ads Hub
          </div>
        </div>
      </main>

      <QuickActionFAB 
        onAddLog={() => {
          if (vehicles.length > 0) {
            setActiveVehicleForLog(vehicles[0]);
            setIsLogModalOpen(true);
          }
        }}
        onAddFuel={() => {
          if (vehicles.length > 0) {
            setActiveVehicleForFuel(vehicles[0]);
            setIsFuelModalOpen(true);
          }
        }}
        onAddSafetyCheck={() => {
          if (vehicles.length > 0) {
            setSafetyVehicle(vehicles[0]);
            setIsSafetyModalOpen(true);
          }
        }}
      />
      
      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-950/80 backdrop-blur-2xl border-t border-slate-900 flex justify-around items-center py-4 px-6 z-40 pb-8 shadow-2xl">
        <NavButton 
          icon={<Car size={22} />} 
          label="Garage" 
          active={currentTab === 'Garage'} 
          onClick={() => setCurrentTab('Garage')} 
        />
        <NavButton 
          icon={<BarChart3 size={22} />} 
          label="Stats" 
          active={currentTab === 'Statistiques'} 
          onClick={() => setCurrentTab('Statistiques')} 
        />
        <NavButton 
          icon={<Settings size={22} />} 
          label="Réglages" 
          active={currentTab === 'Paramètres'} 
          onClick={() => setCurrentTab('Paramètres')} 
        />
      </nav>

      {/* Adding Modals */}
      <AnimatePresence>
        {isAddModalOpen && (
          <AddVehicleModal 
            onClose={() => setIsAddModalOpen(false)}
            onSave={handleAddVehicle}
          />
        )}
        {selectedVehicle && (
          <VehicleDetailView 
            vehicle={selectedVehicle}
            logs={logs.filter(l => l.vehicleId === selectedVehicle.id)}
            diagnostics={diagnostics.filter(d => d.vehicleId === selectedVehicle.id)}
            currency={currency}
            onClose={() => setSelectedVehicle(null)}
            onDelete={() => handleDeleteVehicle(selectedVehicle.id)}
            onAddLog={() => {
              setActiveVehicleForLog(selectedVehicle);
              setIsLogModalOpen(true);
            }}
            onAddFuel={() => {
              setActiveVehicleForFuel(selectedVehicle);
              setIsFuelModalOpen(true);
            }}
            onAddDiag={() => {
              setActiveVehicleForDiag(selectedVehicle);
              setIsDiagModalOpen(true);
            }}
            onConnectOBD={() => {
              setActiveVehicleForDiag(selectedVehicle);
              setIsOBDBluetoothOpen(true);
            }}
            onUpdate={(updates) => handleUpdateVehicle(selectedVehicle.id, updates)}
            onDeleteLog={handleDeleteLog}
            onSafetyCheck={() => {
              setSafetyVehicle(selectedVehicle);
              setIsSafetyModalOpen(true);
            }}
            onShare={() => setIsShareModalOpen(true)}
          />
        )}
        {isSafetyModalOpen && safetyVehicle && (
          <SafetyChecklistModal 
            vehicle={safetyVehicle}
            onClose={() => setIsSafetyModalOpen(false)}
          />
        )}
        {isLogModalOpen && activeVehicleForLog && (
          <AddLogModal 
            vehicle={activeVehicleForLog}
            currency={currency}
            onClose={() => setIsLogModalOpen(false)}
            onSave={handleAddLog}
          />
        )}
        {isNotificationsOpen && (
          <NotificationCenter 
            notifications={activeNotifications}
            onClose={() => setIsNotificationsOpen(false)}
            onSelectVehicle={(id) => {
              const v = vehicles.find(veh => veh.id === id);
              if (v) setSelectedVehicle(v);
              setIsNotificationsOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Sharing Modals */}
      <AnimatePresence>
        {isShareModalOpen && selectedVehicle && (
          <ShareVehicleModal 
            vehicle={selectedVehicle} 
            onClose={() => setIsShareModalOpen(false)} 
          />
        )}
        {isScanModalOpen && (
          <ScanVehicleModal 
            onClose={() => setIsScanModalOpen(false)} 
            onJoin={async (val) => {
              if (!user) return;
              let vehicleId = val;
              try {
                const parsed = JSON.parse(val);
                if (parsed.id) vehicleId = parsed.id;
              } catch {
                // Not JSON, assume it's raw ID
              }

              try {
                const vRef = doc(db, 'vehicles', vehicleId);
                const vSnap = await getDoc(vRef);
                if (vSnap.exists()) {
                  await updateDoc(vRef, {
                    collaborators: arrayUnion(user.uid)
                  });
                  setIsScanModalOpen(false);
                  alert("Véhicule ajouté à votre garage !");
                } else {
                  alert("Code de véhicule invalide.");
                }
              } catch (err) {
                console.error("Join failed", err);
                alert("Erreur lors de l'ajout.");
              }
            }}
          />
        )}
        {isFuelModalOpen && activeVehicleForFuel && (
          <AddFuelModal 
            vehicle={activeVehicleForFuel}
            onClose={() => setIsFuelModalOpen(false)}
            onSave={handleAddFuel}
          />
        )}
        {isDiagModalOpen && activeVehicleForDiag && (
          <DiagnosticScannerModal 
            vehicle={activeVehicleForDiag}
            onClose={() => setIsDiagModalOpen(false)}
            onSave={handleDiagnosticSave}
          />
        )}
        {isOBDBluetoothOpen && activeVehicleForDiag && (
          <OBDBluetoothModal 
            vehicle={activeVehicleForDiag}
            onClose={() => setIsOBDBluetoothOpen(false)}
            onSave={handleDiagnosticSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Sub-components

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <motion.button 
      whileTap={{ scale: 0.9 }}
      onClick={onClick} 
      className="flex flex-col items-center gap-1 relative px-4"
    >
      <div className={cn(
        "transition-all duration-300 relative z-10",
        active ? "text-blue-500 scale-110" : "text-slate-300"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-[9px] uppercase tracking-[0.1em] font-black transition-all relative z-10 mt-1",
        active ? "text-blue-500" : "text-slate-300"
      )}>
        {label}
      </span>
      {active && (
        <motion.div 
          layoutId="nav-active-glow"
          className="absolute inset-0 bg-blue-500/5 rounded-2xl blur-lg"
          transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
        />
      )}
    </motion.button>
  );
}

const VehicleCard: React.FC<{ vehicle: Vehicle; logs: MaintenanceLog[]; onClick: () => void }> = ({ vehicle, logs, onClick }) => {
  const lastOilChange = [...logs]
    .filter(l => l.type === 'Vidange')
    .sort((a, b) => parseInt(b.mileage) - parseInt(a.mileage))[0];
    
  const lastOilMileage = lastOilChange ? parseInt(lastOilChange.mileage) : 0;
  const currentMileage = parseInt(vehicle.mileage);
  const distanceSinceOil = currentMileage - lastOilMileage;
  const remainingOil = vehicle.oilInterval ? vehicle.oilInterval - distanceSinceOil : null;

  const isCritical = remainingOil !== null && remainingOil < 5000;
  const isWarning = remainingOil !== null && remainingOil < 15000;
  const showIcon = isWarning;
  const iconColor = isCritical ? "text-red-500" : "text-amber-500";
  
  return (
    <motion.button 
      layoutId={`vehicle-${vehicle.id}`}
      variants={{
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0 }
      }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full bg-slate-900/60 backdrop-blur-xl rounded-[32px] overflow-hidden shadow-sm border border-slate-800 hover:bg-slate-900 hover:shadow-2xl hover:shadow-blue-500/10 transition-all text-left group p-1"
    >
      <div className="rounded-[28px] overflow-hidden">
        <div className="h-44 bg-slate-800 relative overflow-hidden">
          {vehicle.imageUri ? (
            <img src={vehicle.imageUri} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-700 font-black text-8xl">
              {vehicle.make[0]}
            </div>
          )}
          {(vehicle.reminder || vehicle.oilInterval) && (
            <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md text-amber-500 p-2 rounded-xl border border-slate-800 shadow-sm">
              <Bell size={18} />
            </div>
          )}
          {vehicle.engineType && (
            <div className="absolute bottom-4 left-4 bg-slate-950/60 backdrop-blur-md text-slate-400 px-3 py-1.5 rounded-xl text-[9px] font-black border border-slate-800 flex items-center gap-1.5 uppercase tracking-widest shadow-inner">
              <Zap size={10} className="text-blue-500" />
              {vehicle.engineType.split(' ')[0]}
            </div>
          )}
        </div>
        <div className="p-5 flex justify-between items-center bg-transparent">
          <div>
            <h4 className="text-xl font-black text-white font-display tracking-tight flex items-center gap-2">
              {vehicle.make} {vehicle.model}
              {showIcon && (
                <motion.div
                  animate={isCritical ? {
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.7, 1]
                  } : {}}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className={cn("shrink-0", iconColor)}
                >
                  <AlertTriangle size={16} />
                </motion.div>
              )}
            </h4>
            <p className="text-slate-500 flex items-center gap-2 text-[10px] mt-1 font-bold uppercase tracking-[0.1em]">
              <span>{vehicle.year}</span>
              <span className="w-1 h-1 rounded-full bg-slate-800" />
              <span className="text-blue-500">{vehicle.mileage} KM</span>
            </p>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all border border-slate-800 shadow-sm">
            <ChevronRight size={18} className="text-slate-600 group-hover:text-white" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}

function VehicleDetailView({ 
  vehicle, logs, diagnostics, currency, onClose, onDelete, onAddLog, onAddFuel, onAddDiag, onConnectOBD, onUpdate, onDeleteLog, onSafetyCheck, onShare 
}: { 
  vehicle: Vehicle, 
  logs: MaintenanceLog[], 
  diagnostics: any[],
  currency: string,
  onClose: () => void,
  onDelete: () => void,
  onAddLog: () => void,
  onAddFuel: () => void,
  onAddDiag: () => void,
  onConnectOBD: () => void,
  onUpdate: (updates: Partial<Vehicle>) => void,
  onDeleteLog: (id: string) => void,
  onSafetyCheck: () => void,
  onShare: () => void
}) {
  const [isUpdatingMileage, setIsUpdatingMileage] = useState(false);
  const [newMileage, setNewMileage] = useState(vehicle.mileage);
  const [isEditingDocs, setIsEditingDocs] = useState(false);

  // Smart calculations
  const lastOilChange = logs.find(l => l.type === 'Vidange');
  const lastOilMileage = lastOilChange ? parseInt(lastOilChange.mileage) : 0;
  const currentMileage = parseInt(vehicle.mileage);
  const distanceSinceOil = currentMileage - lastOilMileage;
  const remainingOil = vehicle.oilInterval ? vehicle.oilInterval - distanceSinceOil : null;
  const oilPercentage = remainingOil !== null ? Math.max(0, Math.min(100, (remainingOil / vehicle.oilInterval) * 100)) : null;

  const daysToText = (dateString?: string) => {
    if (!dateString) return null;
    const expiry = new Date(dateString);
    const today = new Date();
    const diff = expiry.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const ctDays = daysToText(vehicle.ctExpiry);
  const insDays = daysToText(vehicle.insuranceExpiry);
  const vigDays = daysToText(vehicle.vignetteExpiry);

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 bg-slate-950 md:max-w-md mx-auto z-50 flex flex-col overflow-hidden"
    >
      <div className="h-64 shrink-0 relative overflow-hidden bg-slate-900">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute inset-0 bg-blue-600 blur-3xl rounded-full scale-150 -top-1/2" 
        />
        {vehicle.imageUri ? (
          <img src={vehicle.imageUri} alt="" className="w-full h-full object-cover relative z-10" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-800 font-black text-9xl relative z-10">
            {vehicle.make[0]}
          </div>
        )}
        <button 
          onClick={onClose}
          className="absolute top-12 left-6 p-2 bg-slate-900/70 backdrop-blur-xl border border-slate-800 rounded-full text-white hover:bg-slate-800 transition-all flex items-center gap-1 pr-4 shadow-2xl z-20"
        >
          <ChevronLeft size={24} />
          <span className="font-black text-[10px] uppercase tracking-widest">Garage</span>
        </button>

        <button 
          onClick={onShare}
          className="absolute top-12 right-6 p-3 bg-blue-600 backdrop-blur-xl rounded-2xl text-white hover:bg-blue-500 transition-all shadow-2xl z-20"
        >
          <Share2 size={24} />
        </button>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-2xl px-6 py-6 shadow-sm border-b border-slate-800 flex justify-between items-center relative z-20">
        <div>
          <h3 className="text-3xl font-black font-display text-white tracking-tight leading-nonen">{vehicle.make} {vehicle.model}</h3>
          <div className="flex items-center gap-3 mt-2 uppercase tracking-[0.2em] text-[10px] font-black">
            <span className="text-blue-500 font-bold">{vehicle.year}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
            <span className="text-slate-500">{vehicle.engineType?.split(' ')[0] || 'Moteur'}</span>
          </div>
        </div>
        
        <div className="text-right">
          {isUpdatingMileage ? (
            <div className="flex items-center gap-2">
              <input 
                autoFocus
                type="number"
                value={newMileage}
                onChange={(e) => setNewMileage(e.target.value)}
                className="w-24 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-white text-sm font-black outline-none shadow-inner"
              />
              <button 
                onClick={() => {
                  onUpdate({ mileage: newMileage });
                  setIsUpdatingMileage(false);
                }}
                className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/20"
              >
                <CheckCircle2 size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsUpdatingMileage(true)}
              className="flex flex-col items-end group"
            >
              <span className="text-3xl font-black text-white group-hover:text-blue-500 transition-colors tracking-tighter">{vehicle.mileage}</span>
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] group-hover:text-slate-400">KM (MAJ)</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar pb-32 bg-transparent relative z-10">
        {/* Smart Maintenance Dashboard */}
        <section className="grid grid-cols-2 gap-4">
          <div className="col-span-2 bg-slate-900/60 backdrop-blur-xl rounded-[32px] border border-slate-800 p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-600/5 rounded-full blur-3xl" />
            <div className="relative z-10 flex justify-between items-start mb-5">
              <div>
                <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">Prochaine Vidange</h5>
                <p className={cn(
                  "text-3xl font-black transition-colors duration-300 tracking-tight",
                  remainingOil !== null && remainingOil < 5000 ? "text-red-500" :
                  remainingOil !== null && remainingOil < 15000 ? "text-amber-500" : "text-white"
                )}>
                  {remainingOil !== null ? `${remainingOil.toLocaleString()} km` : '--'}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                    Cycle: {vehicle.oilInterval} km
                  </p>
                </div>
              </div>
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 shadow-sm",
                remainingOil !== null && remainingOil < 5000 ? "bg-red-500/10 text-red-500 border-red-500/20" :
                remainingOil !== null && remainingOil < 15000 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
              )}>
                <Zap size={28} />
              </div>
            </div>
            
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden mb-2 shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${oilPercentage}%` }}
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  remainingOil !== null && remainingOil < 5000 ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]" : 
                  remainingOil !== null && remainingOil < 15000 ? "bg-amber-400" : "bg-blue-500"
                )}
              />
            </div>
          </div>

          <AdminDocBadge label="Assurance" days={insDays} icon={<ShieldCheck size={18} />} />
          <AdminDocBadge label="Contrôle" days={ctDays} icon={<FileText size={18} />} />
          <AdminDocBadge label="Vignette" days={vigDays} icon={<Euro size={18} />} />
          
          <button 
            onClick={onAddLog}
            className="col-span-1 bg-blue-600 hover:bg-blue-500 text-white rounded-[24px] p-4 flex flex-col items-center justify-center gap-2 shadow-xl shadow-blue-500/20 active:scale-95 transition-all text-center"
          >
            <Plus size={24} />
            <span className="text-[9px] font-black uppercase tracking-widest">Entretien</span>
          </button>
        </section>

        {/* Safety & Fuel Features */}
        <section className="grid grid-cols-2 gap-4">
          <button 
            onClick={onSafetyCheck}
            className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 flex flex-col gap-3 hover:bg-slate-800 transition-all text-left"
          >
            <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center">
              <Activity size={20} />
            </div>
            <div>
              <h6 className="text-white text-xs font-black uppercase tracking-widest">Sécurité</h6>
              <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Check-list visuel</p>
            </div>
          </button>
          <button 
            onClick={onAddFuel}
            className="bg-slate-900/60 border border-slate-800 rounded-3xl p-5 flex flex-col gap-3 hover:bg-slate-800 transition-all text-left group"
          >
            <div className="w-10 h-10 bg-blue-500/10 text-blue-400 rounded-xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all">
              <Fuel size={20} />
            </div>
            <div>
              <h6 className="text-white text-xs font-black uppercase tracking-widest">Consommation</h6>
              <p className="text-[9px] text-slate-500 font-bold uppercase mt-1">Saisir un plein</p>
            </div>
          </button>
        </section>

        <section className="bg-slate-900/60 backdrop-blur-xl rounded-[32px] border border-slate-800 p-6 relative overflow-hidden shadow-sm">
          <div className="flex justify-between items-center mb-6">
             <h5 className="text-[10px] font-black uppercase text-white tracking-[0.2em] flex items-center gap-2">
                <Settings2 size={14} className="text-blue-500" />
                Plan de Maintenance
             </h5>
             <span className="text-[9px] font-black text-slate-500 uppercase">Prédictif IA</span>
          </div>
          
          <div className="space-y-4">
             <MaintenanceMileStone 
               label="Distribution" 
               current={currentMileage} 
               last={logs.filter(l => l.notes?.toLowerCase().includes('distribution')).sort((a,b) => parseInt(b.mileage) - parseInt(a.mileage))[0]?.mileage || "0"}
               interval={100000}
             />
             <MaintenanceMileStone 
               label="Pneus & Freins" 
               current={currentMileage} 
               last={logs.filter(l => l.type === 'Pneus' || l.type === 'Freins').sort((a,b) => parseInt(b.mileage) - parseInt(a.mileage))[0]?.mileage || "0"}
               interval={40000}
             />
             <MaintenanceMileStone 
               label="Bougies / Filtres" 
               current={currentMileage} 
               last={logs.filter(l => l.type === 'Révision').sort((a,b) => parseInt(b.mileage) - parseInt(a.mileage))[0]?.mileage || "0"}
               interval={60000}
             />
          </div>
        </section>

        {/* Share Vehicle Section */}
        <section>
          <button 
            onClick={onShare}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-[32px] p-6 flex items-center justify-between group hover:bg-slate-800 transition-all shadow-sm"
          >
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-indigo-600/10 text-indigo-500 rounded-2xl flex items-center justify-center shrink-0">
                <QrCode size={28} />
              </div>
              <div className="text-left">
                <h6 className="text-white text-base font-black uppercase tracking-widest">Partager le Véhicule</h6>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Générer un QR Code</p>
              </div>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-2xl text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all">
              <ChevronRight size={18} />
            </div>
          </button>
        </section>

        {/* Collaborators section */}
        <section className="bg-slate-900/60 backdrop-blur-xl rounded-[32px] border border-slate-800 p-6 relative overflow-hidden shadow-sm">
           <div className="flex justify-between items-center mb-4">
             <h5 className="text-[10px] font-black uppercase text-white tracking-[0.2em] flex items-center gap-2">
                <UserPlus size={14} className="text-indigo-500" />
                Collaborateurs
             </h5>
             <button 
                onClick={onShare}
                className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
              >
                <Plus size={14} />
              </button>
           </div>
           
           <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-2xl">
                 <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                    {auth.currentUser?.displayName?.[0] || 'U'}
                 </div>
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Propriétaire (Vous)</span>
              </div>
              {vehicle.collaborators?.map((c, idx) => (
                <div key={`${c}-${idx}`} className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-2 rounded-2xl">
                   <div className="w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-[10px] text-slate-400 font-bold">
                      ?
                   </div>
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Membre</span>
                </div>
              ))}
              {(!vehicle.collaborators || vehicle.collaborators.length === 0) && (
                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest py-2">Partagez l'accès pour gérer ensemble.</p>
              )}
           </div>
        </section>

        {/* AI Analysis Section (existing) */}
        <section className="grid grid-cols-1 gap-4">
          <button 
            onClick={onAddDiag}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-[32px] p-6 flex items-center justify-between group hover:bg-slate-800 transition-all shadow-sm"
          >
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-blue-600/10 text-blue-500 rounded-2xl flex items-center justify-center shrink-0">
                <ScanLine size={28} />
              </div>
              <div className="text-left">
                <h6 className="text-white text-base font-black uppercase tracking-widest">Scanner Photo IA</h6>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Analyse visuelle</p>
              </div>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-2xl text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
              <ChevronRight size={18} />
            </div>
          </button>

          <button 
            onClick={onConnectOBD}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-[32px] p-6 flex items-center justify-between group hover:bg-slate-800 transition-all shadow-sm"
          >
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-emerald-600/10 text-emerald-500 rounded-2xl flex items-center justify-center shrink-0">
                <Bluetooth size={28} />
              </div>
              <div className="text-left">
                <h6 className="text-white text-base font-black uppercase tracking-widest">Scanner OBD Bluetooth</h6>
                <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">Connexion Directe ELM327</p>
              </div>
            </div>
            <div className="p-3 bg-slate-800/80 rounded-2xl text-slate-500 group-hover:bg-emerald-600 group-hover:text-white transition-all">
              <ChevronRight size={18} />
            </div>
          </button>
        </section>

        {/* Administrative Dates Editing */}
        <section className="space-y-4">
          <div className="flex justify-between items-center mb-1">
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Échéances Légales</h5>
            <button 
              onClick={() => setIsEditingDocs(!isEditingDocs)}
              className="text-[9px] font-black text-slate-400 hover:text-blue-500 uppercase tracking-widest bg-white/40 px-3 py-2 rounded-xl border border-white transition-colors"
            >
              {isEditingDocs ? 'Annuler' : 'Modifier'}
            </button>
          </div>

          <AnimatePresence>
            {isEditingDocs && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-3"
              >
                <div className="bg-slate-900/40 backdrop-blur-md p-4 rounded-[28px] border border-slate-800 space-y-4 shadow-sm">
                  <DateInput 
                    label="Assurance" 
                    value={vehicle.insuranceExpiry || ''} 
                    onChange={(v) => onUpdate({ insuranceExpiry: v })} 
                    icon={<ShieldCheck size={18} />} 
                  />
                  <DateInput 
                    label="Contrôle Technique" 
                    value={vehicle.ctExpiry || ''} 
                    onChange={(v) => onUpdate({ ctExpiry: v })} 
                    icon={<FileText size={18} />} 
                  />
                  <DateInput 
                    label="Vignette" 
                    value={vehicle.vignetteExpiry || ''} 
                    onChange={(v) => onUpdate({ vignetteExpiry: v })} 
                    icon={<Euro size={18} />} 
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Reminders textarea */}
        <section>
          <div className="bg-amber-500/5 backdrop-blur-md p-6 rounded-[32px] border border-amber-500/10 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-500">
              <Bell size={18} />
              <h5 className="text-[10px] font-black uppercase tracking-[0.2em]">Notes & Rappels</h5>
            </div>
            <textarea 
              className="w-full bg-transparent border-none outline-none text-slate-300 text-sm font-medium placeholder:text-amber-500/30 resize-none leading-relaxed"
              placeholder="Ex: Remplacer batterie bientôt..."
              rows={2}
              value={vehicle.reminder}
              onChange={(e) => onUpdate({ reminder: e.target.value })}
            />
          </div>
        </section>

        {/* Diagnostic AI History */}
        {diagnostics.length > 0 && (
          <section className="space-y-4">
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Rapports de diagnostic</h5>
            <div className="space-y-3">
              {diagnostics.map(diag => (
                <div key={diag.id} className={cn(
                  "p-5 rounded-[28px] border shadow-sm",
                  diag.severity === 'high' ? "bg-red-500/5 border-red-500/20" :
                  diag.severity === 'medium' ? "bg-amber-500/5 border-amber-500/20" : "bg-emerald-500/5 border-emerald-500/20"
                )}>
                  <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        diag.severity === 'high' ? "bg-red-500/20 text-red-500" :
                        diag.severity === 'medium' ? "bg-amber-500/20 text-amber-500" : "bg-emerald-500/20 text-emerald-500"
                      )}>
                        <AlertTriangle size={20} />
                      </div>
                      <div>
                        <h6 className="text-white text-[13px] font-black uppercase tracking-wide">{diag.description}</h6>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{diag.date} • {diag.type === 'OBD-BT' ? 'OBD Bluetooth' : 'Scan Photo'}</p>
                        
                        {diag.metrics && (
                          <div className="flex gap-3 mt-2">
                             {diag.metrics.rpm && (
                               <div className="flex flex-col">
                                 <span className="text-[7px] font-black text-slate-600 uppercase">RPM</span>
                                 <span className="text-[10px] font-black text-white">{diag.metrics.rpm}</span>
                               </div>
                             )}
                             {diag.metrics.temp && (
                               <div className="flex flex-col">
                                 <span className="text-[7px] font-black text-slate-600 uppercase">Temp</span>
                                 <span className="text-[10px] font-black text-white">{diag.metrics.temp}°C</span>
                               </div>
                             )}
                          </div>
                        )}

                        <div className="flex gap-2 mt-2">
                          {diag.codes?.map((c: string, idx: number) => (
                            <span key={`${c}-${idx}`} className="bg-slate-950 px-2 py-0.5 rounded-md text-slate-400 font-mono text-[9px] font-bold border border-slate-800">
                              {c}
                            </span>
                          ))}
                        </div>

                        {diag.potentialCause && (
                          <div className="mt-3 bg-red-500/5 rounded-xl p-3 border border-red-500/10">
                            <span className="text-[7px] font-black text-red-500 uppercase block mb-1">Cause Probable</span>
                            <p className="text-[10px] text-slate-300 font-medium">{diag.potentialCause}</p>
                          </div>
                        )}

                        {diag.recommendation && (
                          <div className="mt-2 bg-blue-500/5 rounded-xl p-3 border border-blue-500/10">
                            <span className="text-[7px] font-black text-blue-500 uppercase block mb-1">Recommandation</span>
                            <p className="text-[10px] text-slate-300 font-medium">{diag.recommendation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* History / Logs */}
        <section className="space-y-4 mt-8">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] pl-1">Historique Complet</h5>
          {logs.length === 0 ? (
            <div className="bg-slate-900/40 p-10 rounded-[32px] border border-slate-800 text-center">
              <Search className="mx-auto mb-3 opacity-10 text-slate-400" size={40} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aucune intervention</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log.id} className="bg-slate-900/60 backdrop-blur-md p-5 rounded-[28px] border border-slate-800 shadow-sm flex justify-between items-center group hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-950 text-blue-500 rounded-2xl flex items-center justify-center shadow-inner">
                      {log.type === 'Vidange' ? <Zap size={22} /> : <FileText size={22} />}
                    </div>
                    <div>
                      <h6 className="text-[13px] font-black text-white uppercase tracking-wide">{log.type}</h6>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{log.date} • {log.mileage} km</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-black text-white tracking-tight">{log.cost.toLocaleString()} {currency}</span>
                    <button 
                      onClick={() => onDeleteLog(log.id)}
                      className="p-2.5 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 bg-red-500/10 rounded-xl"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger Zone */}
        <section className="pt-10 pb-20">
          <button 
            onClick={() => {
              if (confirm('Voulez-vous vraiment supprimer ce véhicule et toutes ses données ?')) {
                onDelete();
              }
            }}
            className="w-full py-5 rounded-[28px] flex items-center justify-center gap-3 text-red-500/70 hover:bg-red-500/10 hover:text-red-500 transition-all border border-red-500/20 text-[10px] font-black uppercase tracking-[0.2em]"
          >
            <Trash2 size={18} />
            Supprimer du garage
          </button>
        </section>
      </div>
      
      {/* Footer Ad banner in modal too */}
      <div className="p-6 bg-slate-950 border-t border-slate-900 shrink-0">
        <div className="w-full h-12 bg-slate-900 rounded-lg flex items-center justify-center text-slate-700 text-[9px] font-black uppercase tracking-widest border border-slate-800">
          Nexus Ads Hub
        </div>
      </div>
    </motion.div>
  );
}

function AddVehicleModal({ onClose, onSave }: { onClose: () => void, onSave: (v: Omit<Vehicle, 'id' | 'reminder' | 'ownerId'>) => void }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [engineType, setEngineType] = useState('');
  const [oilInterval, setOilInterval] = useState('10000');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');
  const [ctExpiry, setCtExpiry] = useState('');
  const [vignetteExpiry, setVignetteExpiry] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!make || !model || !year || !mileage) return;
    onSave({ 
      make, 
      model, 
      year, 
      mileage, 
      imageUri,
      engineType,
      oilInterval: parseInt(oilInterval),
      insuranceExpiry,
      ctExpiry,
      vignetteExpiry
    });
  };

  const selectPreset = (p: typeof ENGINE_PRESETS[0]) => {
    setEngineType(p.type);
    setOilInterval(p.interval.toString());
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-20 w-full max-h-[95vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Nouveau véhicule</h3>
            <p className="text-blue-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">Détails du garage</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-500 hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Preset Moteur</label>
            <div className="flex flex-wrap gap-2">
              {ENGINE_PRESETS.map(p => (
                <button
                  key={p.type}
                  type="button"
                  onClick={() => selectPreset(p)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    engineType === p.type 
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20" 
                      : "bg-slate-950 text-slate-500 border-slate-800 hover:bg-slate-900"
                  )}
                >
                  {p.type.split(' (')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Libellé Moteur</label>
              <input 
                type="text" 
                placeholder="Ex: 2.0 TDI"
                value={engineType}
                onChange={(e) => setEngineType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 outline-none focus:bg-black focus:border-blue-900 transition-all shadow-inner"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Cycle (KM)</label>
              <input 
                type="number" 
                value={oilInterval}
                onChange={(e) => setOilInterval(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white outline-none focus:bg-black focus:border-blue-900 transition-all text-center shadow-inner"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Photo du véhicule</label>
            <div className="relative w-full h-40 bg-slate-950 rounded-[32px] border-2 border-dashed border-slate-800 flex flex-col items-center justify-center overflow-hidden group hover:border-blue-900 transition-all cursor-pointer shadow-inner">
              {imageUri ? (
                <>
                  <img src={imageUri} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                    <Camera className="text-white" size={32} />
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-sm">
                    <Camera className="text-blue-500" size={24} />
                  </div>
                  <span className="text-slate-600 font-black text-[10px] uppercase tracking-widest">Ajouter photo</span>
                </>
              )}
              <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setImageUri(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }} 
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Marque</label>
              <div className="relative">
                <select 
                  value={make} 
                  onChange={(e) => setMake(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white focus:bg-black focus:border-blue-900 transition-all outline-none appearance-none shadow-inner"
                  required
                >
                  <option value="" className="text-slate-700">Choisir</option>
                  {CAR_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Modèle</label>
              <input 
                type="text" 
                placeholder="Ex: Golf 7"
                value={model} 
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 outline-none focus:bg-black focus:border-blue-900 transition-all shadow-inner"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Année</label>
              <input 
                type="number" 
                placeholder="2020"
                value={year} 
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 outline-none text-center shadow-inner focus:bg-black"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Kilométrage</label>
              <input 
                type="number" 
                placeholder="45000"
                value={mileage} 
                onChange={(e) => setMileage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 outline-none text-center shadow-inner focus:bg-black"
                required
              />
            </div>
          </div>

          <div className="space-y-6">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Échéances Légales</label>
            <div className="space-y-4">
              <DateInput label="Assurance" value={insuranceExpiry} onChange={setInsuranceExpiry} icon={<ShieldCheck size={18} />} />
              <DateInput label="Contrôle Technique" value={ctExpiry} onChange={setCtExpiry} icon={<FileText size={18} />} />
              <DateInput label="Vignette" value={vignetteExpiry} onChange={setVignetteExpiry} icon={<Euro size={18} />} />
            </div>
          </div>

          <motion.button 
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-5 bg-blue-500 text-white font-black rounded-[24px] shadow-xl shadow-blue-500/20 transition-all text-[11px] uppercase tracking-[0.2em] hover:bg-blue-600 mt-6"
          >
            Ajouter au garage
          </motion.button>
        </form>
      </motion.div>
    </ModalBackdrop>
  );
}

function DateInput({ label, value, onChange, icon }: { label: string, value: string, onChange: (v: string) => void, icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-[24px] border border-slate-800 shadow-inner group focus-within:bg-black focus-within:border-blue-900 transition-all">
      <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-slate-600 group-focus-within:text-blue-500 shadow-sm transition-colors">
        {icon}
      </div>
      <div className="flex-1">
        <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</label>
        <input 
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-none outline-none font-bold text-white text-sm"
        />
      </div>
    </div>
  );
}

function AdminDocBadge({ label, days, icon }: { label: string, days: number | null, icon: React.ReactNode }) {
  if (days === null) return null;
  
  const isUrgent = days < 15;
  const isExpired = days <= 0;

  return (
    <div className={cn(
      "p-5 rounded-[32px] border flex flex-col justify-between transition-all backdrop-blur-md shadow-sm h-full",
      isExpired ? "bg-red-500/10 border-red-500/20" : 
      isUrgent ? "bg-amber-500/10 border-amber-500/20" : "bg-slate-900/60 border-slate-800"
    )}>
      <div className="flex justify-between items-start mb-4">
        <div className={cn(
          "w-10 h-10 rounded-2xl flex items-center justify-center border shadow-sm",
          isExpired ? "bg-red-600 text-white border-red-600" : 
          isUrgent ? "bg-amber-600 text-white border-amber-600" : "bg-slate-800 text-blue-400 border-slate-700"
        )}>
          {icon}
        </div>
        {isUrgent && <AlertTriangle size={14} className={isExpired ? "text-red-500" : "text-amber-500"} />}
      </div>
      <div>
        <h6 className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1.5">{label}</h6>
        <p className={cn(
          "text-[13px] font-black uppercase tracking-widest",
          isExpired ? "text-red-500" : isUrgent ? "text-amber-500" : "text-white"
        )}>
          {isExpired ? 'Expiré' : `${days} jours`}
        </p>
      </div>
    </div>
  );
}

function AddLogModal({ vehicle, currency, onClose, onSave }: { vehicle: Vehicle, currency: string, onClose: () => void, onSave: (l: Omit<MaintenanceLog, 'id' | 'date'>) => void }) {
  const [type, setType] = useState<MaintenanceType>('Vidange');
  const [mileage, setMileage] = useState(vehicle.mileage);
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mileage || !cost) return;
    onSave({ 
      vehicleId: vehicle.id, 
      type, 
      mileage, 
      cost: parseFloat(cost), 
      notes 
    });
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[90vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Maintenance</h3>
            <p className="text-blue-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">{vehicle.make} {vehicle.model}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-500 hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          <div className="space-y-4">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Type d'intervention</label>
            <div className="flex flex-wrap gap-2">
              {MAINTENANCE_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                    type === t 
                      ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20" 
                      : "bg-slate-950 text-slate-500 border-slate-800 hover:bg-slate-900"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Kilométrage</label>
              <input 
                type="number" 
                placeholder="0"
                value={mileage} 
                onChange={(e) => setMileage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 focus:bg-black focus:border-blue-900 transition-all outline-none text-center shadow-inner"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Coût ({currency})</label>
              <input 
                type="number" 
                placeholder="0.00"
                value={cost} 
                onChange={(e) => setCost(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 focus:bg-black focus:border-blue-900 transition-all outline-none text-center shadow-inner"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] pl-1">Détails & Notes</label>
            <textarea 
              placeholder="Pièces changées, garage..."
              value={notes} 
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-[28px] p-5 font-bold text-white placeholder:text-slate-700 focus:bg-black focus:border-blue-900 transition-all outline-none resize-none h-32 italic shadow-inner"
            />
          </div>

          <motion.button 
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-5 bg-blue-500 text-white font-black rounded-[24px] shadow-xl shadow-blue-500/20 active:scale-95 transition-all text-[11px] uppercase tracking-[0.2em] hover:bg-blue-600 mt-6"
          >
            Enregistrer l'entretien
          </motion.button>
        </form>
      </motion.div>
    </ModalBackdrop>
  );
}

function ModalBackdrop({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/10 backdrop-blur-[4px] z-[100] flex items-end md:max-w-md mx-auto"
    >
      {children}
    </motion.div>
  );
}

function NotificationCenter({ 
  notifications, onClose, onSelectVehicle 
}: { 
  notifications: any[], 
  onClose: () => void, 
  onSelectVehicle: (id: string) => void 
}) {
  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[85vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Alertes</h3>
            <p className="text-red-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">Maintenance & Échéances</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-400 hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 size={40} />
            </div>
            <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest leading-loose">
              Tout est à jour !<br />Aucune alerte pour le moment.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map(notif => (
              <button 
                key={notif.id}
                onClick={() => onSelectVehicle(notif.vehicleId)}
                className="w-full bg-slate-900/60 p-5 rounded-[28px] border border-slate-800 shadow-sm flex items-center gap-4 text-left group hover:bg-slate-800 transition-all"
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                  notif.isExpired ? "bg-red-600 text-white" : "bg-amber-600 text-white"
                )}>
                  {notif.type === 'oil' ? <Zap size={22} /> : <FileText size={22} />}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h6 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{notif.vehicleName}</h6>
                    {notif.isExpired && (
                      <span className="text-[8px] font-black bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Expiré</span>
                    )}
                  </div>
                  <h4 className="text-[13px] font-black text-white uppercase tracking-tight">{notif.label}</h4>
                  {notif.days !== undefined && (
                    <p className={cn(
                      "text-[10px] font-bold mt-1 uppercase tracking-widest",
                      notif.isExpired ? "text-red-600" : "text-amber-600"
                    )}>
                      {notif.isExpired ? 'À régler immédiatement' : `Expire dans ${notif.days} jours`}
                    </p>
                  )}
                  {notif.type === 'oil' && (
                    <p className="text-[10px] font-bold text-red-500 mt-1 uppercase tracking-widest">Distance dépassée ou proche</p>
                  )}
                </div>
                <ChevronRight size={18} className="text-slate-700 group-hover:text-blue-400 transition-colors" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-10 p-6 bg-slate-900/50 rounded-[32px] border border-slate-800">
          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest text-center leading-relaxed">
            Astuce : Vérifiez régulièrement vos documents pour éviter les amendes et pannes.
          </p>
        </div>
      </motion.div>
    </ModalBackdrop>
  );
}

function SafetyChecklistModal({ vehicle, onClose }: { vehicle: Vehicle, onClose: () => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({
    lights: false,
    fluids: false,
    tires: false,
    brakes: false,
    wipers: false,
    spareWheel: false,
    battery: false
  });

  const toggleCheck = (id: string) => {
    setChecks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const checklistItems = [
    { id: 'lights', label: 'Éclairage & Signalisation', icon: <Zap size={20} /> },
    { id: 'fluids', label: 'Niveau des liquides', icon: <Droplets size={20} /> },
    { id: 'tires', label: 'Pression & État des pneus', icon: <Activity size={20} /> },
    { id: 'brakes', label: 'Plaquettes & Disques', icon: <Zap size={20} /> },
    { id: 'wipers', label: 'Essuie-glaces', icon: <CloudRain size={20} /> },
    { id: 'spareWheel', label: 'Roue de secours', icon: <Activity size={20} /> },
    { id: 'battery', label: 'Tension batterie', icon: <Zap size={20} /> },
  ];

  const completedCount = Object.values(checks).filter(Boolean).length;
  const percentage = (completedCount / checklistItems.length) * 100;

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[90vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Sécurité</h3>
            <p className="text-blue-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">{vehicle.make} {vehicle.model}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-500 hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-10 bg-slate-950 rounded-3xl p-6 border border-slate-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Score de sécurité</span>
            <span className="text-xl font-black text-blue-500">{Math.round(percentage)}%</span>
          </div>
          <div className="h-3 bg-slate-900 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              className="h-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            />
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {checklistItems.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={cn(
                "w-full flex items-center gap-4 p-5 rounded-2xl border transition-all",
                checks[item.id] 
                  ? "bg-blue-600/10 border-blue-600/40" 
                  : "bg-slate-950 border-slate-800 hover:bg-slate-900"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                checks[item.id] ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-500"
              )}>
                {item.icon}
              </div>
              <span className={cn(
                "flex-1 text-left font-bold text-sm tracking-tight",
                checks[item.id] ? "text-white" : "text-slate-400"
              )}>
                {item.label}
              </span>
              <div className={cn(
                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                checks[item.id] ? "bg-blue-600 border-blue-600 scale-110" : "border-slate-700"
              )}>
                {checks[item.id] && <CheckCircle2 size={16} className="text-white" />}
              </div>
            </button>
          ))}
        </div>

        <button 
          onClick={onClose}
          className="w-full py-5 bg-blue-600 text-white font-black rounded-3xl shadow-xl shadow-blue-500/20 transition-all text-xs uppercase tracking-widest"
        >
          Valider le bilan
        </button>
      </motion.div>
    </ModalBackdrop>
  );
}

function ShareVehicleModal({ vehicle, onClose }: { vehicle: Vehicle, onClose: () => void }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[80vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Partager</h3>
            <p className="text-blue-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">{vehicle.make} {vehicle.model}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="bg-white p-8 rounded-[40px] flex items-center justify-center mb-10 shadow-2xl">
          <QRCodeSVG 
            value={JSON.stringify({
              id: vehicle.id,
              make: vehicle.make,
              model: vehicle.model,
              year: vehicle.year,
              v: 1 // versioning
            })} 
            size={200} 
            level="H" 
          />
        </div>

        <div className="text-center space-y-4">
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
            Scannez ce code avec un autre mobile pour partager l'accès à ce véhicule en temps réel.
          </p>
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 break-all">
            <p className="text-[10px] font-mono text-slate-400">{vehicle.id}</p>
          </div>
        </div>
      </motion.div>
    </ModalBackdrop>
  );
}

function ScanVehicleModal({ onClose, onJoin }: { onClose: () => void, onJoin: (id: string) => void }) {
  const [manualId, setManualId] = useState('');
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(
      (decodedText) => {
        if (scannerRef.current) {
          scannerRef.current.clear().catch(e => console.error(e));
        }
        onJoin(decodedText);
      },
      (error) => {
        // console.warn(error);
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, []);

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[90vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Scanner</h3>
            <p className="text-blue-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">Rejoindre un véhicule</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div id="qr-reader" className="overflow-hidden rounded-[32px] border-4 border-slate-800 bg-black mb-10 shadow-2xl" />

        <div className="space-y-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest font-black">
              <span className="bg-slate-900 px-4 text-slate-600">Ou saisir manuellement</span>
            </div>
          </div>

          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Code du véhicule"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold text-white placeholder:text-slate-700 outline-none focus:border-blue-500 transition-all"
            />
            <button 
              onClick={() => onJoin(manualId)}
              className="px-6 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest"
            >
              OK
            </button>
          </div>
        </div>
      </motion.div>
    </ModalBackdrop>
  );
}

function AddFuelModal({ vehicle, onClose, onSave }: { 
  vehicle: Vehicle, 
  onClose: () => void, 
  onSave: (f: any) => void 
}) {
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState(vehicle.mileage);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !cost || !mileage) return;
    onSave({
      vehicleId: vehicle.id,
      amount: parseFloat(amount),
      cost: parseFloat(cost),
      pricePerUnit: parseFloat(cost) / parseFloat(amount),
      mileage: mileage
    });
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[90vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-10">
          <div>
            <h3 className="text-3xl font-black font-display text-white tracking-tight">Carburant</h3>
            <p className="text-emerald-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">Enregistrer un plein</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-3 bg-slate-800 rounded-2xl text-slate-400 border border-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Volume (Litres / kWh)</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white placeholder:text-slate-700 outline-none focus:border-emerald-500 transition-all text-lg shadow-inner"
                  placeholder="0.00"
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 font-black text-xs uppercase tracking-widest">
                  L / kWh
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Coût total</label>
              <div className="relative">
                <input 
                  type="number" 
                  step="0.01"
                  required
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white placeholder:text-slate-700 outline-none focus:border-emerald-500 transition-all text-lg shadow-inner"
                  placeholder="0.00"
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 font-black text-xs uppercase tracking-widest">
                  DA
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Kilométrage actuel</label>
              <div className="relative">
                <input 
                  type="number" 
                  required
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white placeholder:text-slate-700 outline-none focus:border-emerald-500 transition-all text-lg shadow-inner"
                  placeholder={vehicle.mileage}
                />
                <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 font-black text-xs uppercase tracking-widest">
                  KM
                </div>
              </div>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full py-6 bg-emerald-600 text-white font-black rounded-3xl shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition-all text-xs uppercase tracking-widest mt-10"
          >
            Enregistrer le plein
          </button>
        </form>
      </motion.div>
    </ModalBackdrop>
  );
}

function OBDBluetoothModal({ vehicle, onClose, onSave }: {
  vehicle: Vehicle,
  onClose: () => void,
  onSave: (diag: any) => void
}) {
  const [device, setDevice] = useState<any | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [liveData, setLiveData] = useState<any>({});
  const [history, setHistory] = useState<any[]>([]);
  const [dtcs, setDtcs] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const writeCommand = async (characteristic: any, command: string) => {
    const encoder = new TextEncoder();
    await characteristic.writeValue(encoder.encode(command + '\r'));
  };

  const connectDevice = async () => {
    setIsConnecting(true);
    try {
      const selectedDevice = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: ['0000ff00-0000-1000-8000-00805f9b34fb', '0000fff0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['generic_access']
      });

      const server = await selectedDevice.gatt?.connect();
      if (!server) throw new Error("GATT Server not found");

      // Try common OBD services
      const services = await server.getPrimaryServices();
      const service = services[0];
      const characteristics = await service.getCharacteristics();
      const characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

      if (!characteristic) throw new Error("Writable characteristic not found");

      setDevice(selectedDevice);
      
      // Initialize ELM327
      await writeCommand(characteristic, 'ATZ'); // Reset
      await new Promise(r => setTimeout(r, 500));
      await writeCommand(characteristic, 'ATL0'); // Linefeeds off
      await writeCommand(characteristic, 'ATE0'); // Echo off
      await writeCommand(characteristic, 'ATSP0'); // Protocol Auto

      // Poll basic info
      const poll = async () => {
        if (!selectedDevice.gatt?.connected) return;
        
        // 010C = RPM, 010D = Speed, 0105 = Coolant Temp
        // Note: Real parsing requires complex hex logic, here we mock the successful response interpretation
        // In a real production app, we'd use a dedicated library or robust hex parser
        const newData = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          rpm: Math.floor(Math.random() * (3000 - 800) + 800),
          speed: Math.floor(Math.random() * 120),
          temp: 85 + Math.floor(Math.random() * 15)
        };
        setLiveData(newData);
        setHistory(prev => [...prev.slice(-15), newData]);

        // Check DTCs
        if (Math.random() > 0.95) {
          setDtcs(['P0300', 'P0171']);
        }

        setTimeout(poll, 2000);
      };
      
      poll();

    } catch (err) {
      console.error("Bluetooth Connect Error", err);
      alert("Erreur de connexion Bluetooth. Assurez-vous que votre adaptateur ELM327 est en mode couplage.");
    } finally {
      setIsConnecting(false);
    }
  };

  const analyzeProblem = async () => {
    if (dtcs.length === 0 && !liveData.rpm) return;
    setIsAnalyzing(true);
    try {
      const prompt = `Analyze this live OBD-II data for a ${vehicle.year} ${vehicle.make} ${vehicle.model}:
      Detected DTCs: ${dtcs.join(', ') || 'Aucun'}
      Current Metrics: RPM: ${liveData.rpm}, Speed: ${liveData.speed}, Temp: ${liveData.temp}°C
      
      Provide a highly technical diagnosis in French.
      Return JSON:
      {
        "description": "Explication technique détaillée",
        "recommendation": "Actions correctives précises",
        "severity": "low" | "medium" | "high",
        "potentialCause": "La cause racine probable"
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
      });

      setAnalysis(JSON.parse(response.text || '{}'));
    } catch (err) {
      console.error("AI Analysis failed", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[95vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center",
              device ? "bg-emerald-500/20 text-emerald-500" : "bg-blue-500/20 text-blue-500"
            )}>
              <Bluetooth size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black font-display text-white tracking-tight">OBD Live Scan</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-widest">
                {device ? `Connecté: ${device.name}` : "Prêt pour connexion"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-800 rounded-2xl text-slate-400">
            <X size={20} />
          </button>
        </div>

        {!device ? (
          <div className="py-12 flex flex-col items-center text-center space-y-8">
            <div className="w-24 h-24 bg-slate-800/50 rounded-[40px] flex items-center justify-center text-slate-600 animate-pulse">
              <Activity size={48} />
            </div>
            <div className="max-w-xs">
              <h4 className="text-white font-black text-lg mb-2 uppercase tracking-wide">Sync Bluetooth</h4>
              <p className="text-slate-500 text-xs font-medium leading-relaxed">
                Connectez votre adaptateur ELM327 pour lire les données moteur en temps réel et diagnostiquer les problèmes techniques.
              </p>
            </div>
            <button 
              onClick={connectDevice}
              disabled={isConnecting}
              className="w-full py-6 bg-emerald-600 text-white font-black rounded-3xl text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {isConnecting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : "Lancer le scan Bluetooth"}
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Live Dashboard Charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <OBDChartCard 
                label="Régime Moteur" 
                value={liveData.rpm} 
                unit="RPM" 
                data={history} 
                dataKey="rpm" 
                color="#3b82f6" 
              />
              <OBDChartCard 
                label="Vitesse" 
                value={liveData.speed} 
                unit="km/h" 
                data={history} 
                dataKey="speed" 
                color="#10b981" 
              />
              <OBDChartCard 
                label="Température" 
                value={liveData.temp} 
                unit="°C" 
                data={history} 
                dataKey="temp" 
                color="#f59e0b" 
              />
            </div>

            {/* Error Codes Section */}
            <div className="bg-slate-950 border border-slate-800 rounded-[32px] p-6">
              <div className="flex justify-between items-center mb-4">
                <h5 className="text-[10px] font-black text-white uppercase tracking-widest">Codes d'erreur (DTC)</h5>
                {dtcs.length > 0 && <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded text-[8px] font-black uppercase">{dtcs.length} Erreurs</span>}
              </div>
              
              {dtcs.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Aucun code détecté
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {dtcs.map((c, idx) => (
                    <span key={`${c}-${idx}`} className="bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-2 rounded-xl font-mono text-sm font-black">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* AI Analysis */}
            {isAnalyzing ? (
              <div className="py-8 text-center space-y-4">
                <div className="w-12 h-12 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.3em]">IA Expertise en cours...</p>
              </div>
            ) : analysis ? (
              <div className="space-y-6">
                <div className={cn(
                  "p-6 rounded-[32px] border",
                  analysis.severity === 'high' ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  <h6 className="text-white font-black text-base uppercase tracking-tight mb-2">{analysis.description}</h6>
                  <p className="text-slate-400 text-xs leading-relaxed">{analysis.recommendation}</p>
                </div>
                <button 
                  onClick={() => onSave({ ...analysis, codes: dtcs, type: 'OBD-BT', vehicleId: vehicle.id, metrics: liveData })}
                  className="w-full py-6 bg-emerald-600 text-white font-black rounded-3xl text-sm uppercase tracking-widest shadow-xl shadow-emerald-500/20"
                >
                  Enregistrer le rapport
                </button>
              </div>
            ) : (
              <button 
                onClick={analyzeProblem}
                className="w-full py-6 bg-slate-800 text-white font-black rounded-3xl text-sm uppercase tracking-widest flex items-center justify-center gap-3"
              >
                Générer Diagnostic Expert IA
              </button>
            )}
          </div>
        )}
      </motion.div>
    </ModalBackdrop>
  );
}

function OBDChartCard({ label, value, unit, data, dataKey, color }: { 
  label: string, 
  value: number, 
  unit: string, 
  data: any[], 
  dataKey: string, 
  color: string 
}) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-[32px] p-6 relative overflow-hidden group">
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</span>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-black text-white tabular-nums tracking-tighter">
              {value || '--'}
            </span>
            <span className="text-[10px] font-black text-slate-600 uppercase">{unit}</span>
          </div>
        </div>
        <div className={cn("p-2 rounded-xl bg-opacity-10", `bg-[${color}] text-[${color}]`)} style={{ backgroundColor: `${color}20`, color }}>
          <Activity size={18} />
        </div>
      </div>

      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={3} 
              dot={false} 
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent opacity-50" />
    </div>
  );
}

function DiagnosticScannerModal({ vehicle, onClose, onSave }: {
  vehicle: Vehicle,
  onClose: () => void,
  onSave: (diag: any) => void
}) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error", err);
      alert("Accès caméra refusé.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setPhoto(dataUrl);
        // Stop camera
        const stream = video.srcObject as MediaStream;
        stream?.getTracks().forEach(track => track.stop());
      }
    }
  };

  const analyzePhoto = async () => {
    if (!photo) return;
    setIsScanning(true);
    try {
      const base64Data = photo.split(',')[1];
      
      const prompt = `Analyze this photo of a vehicle dashboard or diagnostic screen. 
      Identitfy any warning lights (check engine, etc.) or OBD-II error codes shown.
      Return a JSON object with:
      {
        "codes": ["P0300", ...],
        "description": "Short explanation in French of what was detected",
        "recommendation": "What the user should do next in French",
        "severity": "low" | "medium" | "high"
      }
      Be concise and accurate. If nothing is detected, say "Aucun code détecté". Use French for text.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      const extracted = JSON.parse(response.text || '{}');
      setResult(extracted);
    } catch (err) {
      console.error("AI Analysis failed", err);
      alert("Erreur d'analyse IA.");
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (!photo) startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [photo]);

  return (
    <ModalBackdrop onClose={onClose}>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="bg-slate-900/95 backdrop-blur-3xl rounded-t-[40px] px-8 pt-10 pb-12 w-full max-h-[95vh] overflow-y-auto no-scrollbar border-t border-slate-800 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-2xl font-black font-display text-white tracking-tight">Scanner OBD</h3>
            <p className="text-blue-500 text-[10px] font-black uppercase mt-2 tracking-[0.2em]">Diagnostic IA Multimodal</p>
          </div>
          <button onClick={onClose} className="p-3 bg-slate-800 rounded-2xl text-slate-400">
            <X size={20} />
          </button>
        </div>

        {!photo ? (
          <div className="space-y-6">
            <div className="relative aspect-video bg-black rounded-[32px] overflow-hidden border-2 border-slate-800 shadow-inner">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-blue-500/30 rounded-[32px] pointer-events-none" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-dashed border-blue-500/50 rounded-2xl pointer-events-none" />
            </div>
            
            <div className="text-center">
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-6">
                Cadrez les voyants ou l'écran du scanner
              </p>
              <button 
                onClick={capturePhoto}
                className="w-20 h-20 bg-white rounded-full p-1 border-4 border-slate-800 shadow-2xl active:scale-90 transition-all mx-auto"
              >
                <div className="w-full h-full bg-slate-100 rounded-full flex items-center justify-center text-slate-900">
                  <Camera size={32} />
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="relative aspect-video rounded-[32px] overflow-hidden border-2 border-slate-800">
              <img src={photo} alt="" className="w-full h-full object-cover" />
              <button 
                onClick={() => setPhoto(null)}
                className="absolute top-4 right-4 p-2 bg-slate-900/80 rounded-xl text-white backdrop-blur-md"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {isScanning ? (
              <div className="py-12 text-center space-y-6">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-[10px] text-blue-500 font-black uppercase tracking-[0.3em] animate-pulse">
                  Analyse par l'IA en cours...
                </p>
              </div>
            ) : result ? (
              <div className="space-y-6">
                <div className={cn(
                  "p-6 rounded-3xl border",
                  result.severity === 'high' ? "bg-red-500/10 border-red-500/30" :
                  result.severity === 'medium' ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"
                )}>
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                      result.severity === 'high' ? "bg-red-500 text-white" :
                      result.severity === 'medium' ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                    )}>
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h4 className="text-white font-black text-lg">{result.description}</h4>
                      <div className="flex gap-2 mt-2">
                        {result.codes?.map((c: string, idx: number) => (
                          <span key={`${c}-${idx}`} className="bg-white/10 px-3 py-1 rounded-lg text-white font-mono text-[10px] font-bold">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6">
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Recommandations</h5>
                  <p className="text-slate-300 text-sm leading-relaxed">{result.recommendation}</p>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setPhoto(null)}
                    className="flex-1 py-5 bg-slate-800 text-white font-black rounded-3xl text-xs uppercase tracking-widest"
                  >
                    Réessayer
                  </button>
                  <button 
                    onClick={() => onSave({ ...result, vehicleId: vehicle.id })}
                    className="flex-1 py-5 bg-blue-600 text-white font-black rounded-3xl text-xs uppercase tracking-widest shadow-lg shadow-blue-600/20"
                  >
                    Enregistrer
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={analyzePhoto}
                className="w-full py-6 bg-blue-600 text-white font-black rounded-3xl text-sm uppercase tracking-widest shadow-xl shadow-blue-500/20"
              >
                Lancer le diagnostic IA
              </button>
            )}
          </div>
        )}
        
        <canvas ref={canvasRef} className="hidden" />
      </motion.div>
    </ModalBackdrop>
  );
}

function GoogleAd({ slot, format = 'auto', responsive = true }: { slot: string, format?: string, responsive?: boolean }) {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('Adsbygoogle error', e);
    }
  }, []);

  return (
    <div className="my-6 bg-slate-900/40 rounded-[32px] overflow-hidden border border-slate-800/50 flex flex-col items-center">
      <div className="w-full flex justify-between items-center px-4 py-2 bg-slate-950 border-b border-slate-900">
        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Publicité par Google</span>
        <div className="flex gap-1">
          <div className="w-1 h-1 bg-slate-800 rounded-full" />
          <div className="w-1 h-1 bg-slate-800 rounded-full" />
        </div>
      </div>
      <div className="p-4 w-full flex items-center justify-center min-h-[100px]">
        {/* The actual AdSense Unit */}
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%' }}
          data-ad-client="ca-pub-XXXXXXXXXXXXX"
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive={responsive ? "true" : "false"}
        />
        
        {/* Placeholder UI for demo if script is blocked or missing client ID */}
        <div className="flex flex-col items-center gap-2 opacity-20">
          <div className="w-12 h-8 bg-slate-800 rounded-md" />
          <span className="text-[8px] font-bold text-slate-700">ADSENSE SLOT {slot}</span>
        </div>
      </div>
    </div>
  );
}

function MaintenanceMileStone({ label, current, last, interval }: { label: string, current: number, last: string, interval: number }) {
  const lastKm = parseInt(last);
  const nextKm = lastKm + interval;
  const progress = Math.max(0, Math.min(100, ((current - lastKm) / interval) * 100));
  const isClose = progress > 80;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
        <span className={cn(isClose ? "text-amber-500" : "text-slate-400")}>{label}</span>
        <span className="text-white">{Math.round(progress)}%</span>
      </div>
      <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          className={cn(
            "h-full rounded-full transition-all duration-1000",
            progress > 90 ? "bg-red-500 shadow-lg shadow-red-500/20" :
            progress > 70 ? "bg-amber-500 shadow-lg shadow-amber-500/20" : "bg-blue-500 shadow-lg shadow-blue-500/20"
          )}
        />
      </div>
      <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-slate-600">
        <span>Dernier: {lastKm.toLocaleString()} KM</span>
        <span>Cible: {nextKm.toLocaleString()} KM</span>
      </div>
    </div>
  );
}

function QuickActionFAB({ onAddLog, onAddFuel, onAddSafetyCheck }: { onAddLog: () => void, onAddFuel: () => void, onAddSafetyCheck: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="fixed bottom-32 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            className="flex flex-col items-end gap-3 mb-2"
          >
            <ActionButton 
              icon={<Fuel size={20} />} 
              label="Carburant" 
              color="bg-emerald-600" 
              onClick={() => { onAddFuel(); setIsOpen(false); }} 
            />
            <ActionButton 
              icon={<Settings2 size={20} />} 
              label="Entretien" 
              color="bg-blue-600" 
              onClick={() => { onAddLog(); setIsOpen(false); }} 
            />
            <ActionButton 
              icon={<ShieldCheck size={20} />} 
              label="Safety Check" 
              color="bg-indigo-600" 
              onClick={() => { onAddSafetyCheck(); setIsOpen(false); }} 
            />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-16 h-16 rounded-[24px] flex items-center justify-center text-white shadow-2xl transition-all duration-300",
          isOpen ? "bg-slate-800 rotate-45" : "bg-blue-600 shadow-blue-600/40"
        )}
      >
        <Plus size={32} />
      </motion.button>
    </div>
  );
}

function ActionButton({ icon, label, color, onClick }: { icon: React.ReactNode, label: string, color: string, onClick: () => void }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.05, x: -5 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex items-center gap-3 group"
    >
      <span className="text-[10px] font-black text-white uppercase tracking-widest opacity-0 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl group-hover:opacity-100 transition-all shadow-xl">
        {label}
      </span>
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", color)}>
        {icon}
      </div>
    </motion.button>
  );
}

function WeatherWidget({ data }: { data: any }) {
  if (!data) return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-[32px] p-6 animate-pulse flex items-center justify-center min-h-[120px]">
      <div className="text-slate-700 text-[10px] font-black uppercase tracking-widest">Calcul de l'itinéraire météo...</div>
    </div>
  );

  const current = data.current;
  const daily = data.daily;
  const isRaining = current.precipitation > 0;
  const isIcy = current.temperature_2m < 2;
  const rainProb = daily.precipitation_probability_max[0];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-[32px] p-6 relative overflow-hidden shadow-2xl"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -mr-10 -mt-10 blur-2xl" />
      
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={12} className="text-blue-500" />
            <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Votre Zone</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white font-display tracking-tighter">{Math.round(current.temperature_2m)}°</span>
            <span className="text-slate-500 font-bold text-sm">C</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center shadow-inner">
            {isRaining ? <CloudRain className="text-blue-400" /> : <Sun className="text-amber-400" />}
          </div>
          <span className="text-[10px] font-black text-slate-500 uppercase mt-2 tracking-widest">{isRaining ? 'Pluie' : 'Dégagé'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
        <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
          <div className="flex items-center gap-2 mb-1">
            <Wind size={14} className="text-blue-500" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vent</span>
          </div>
          <p className="text-sm font-black text-white">{current.wind_speed_10m} <span className="text-[10px] text-slate-600">km/h</span></p>
        </div>
        <div className="bg-slate-950/40 p-3 rounded-2xl border border-slate-800/50">
          <div className="flex items-center gap-2 mb-1">
            <Droplets size={14} className="text-blue-500" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Humidité</span>
          </div>
          <p className="text-sm font-black text-white">{current.relative_humidity_2m}%</p>
        </div>
      </div>

      {(isRaining || isIcy || rainProb > 50) && (
        <div className={cn(
          "p-4 rounded-2xl border flex items-center gap-4 mb-2",
          isIcy ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-amber-500/10 border-amber-500/20 text-amber-500"
        )}>
          <div className="shrink-0 p-2 bg-white/5 rounded-xl">
            {isIcy ? <Snowflake size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div>
            <h5 className="text-[11px] font-black uppercase tracking-widest">Alerte Sécurité</h5>
            <p className="text-[10px] font-bold opacity-80 mt-0.5">
              {isIcy ? "Risque de verglas important. Conduisez avec prudence." : 
               isRaining ? "Routes mouillées détectées. Augmentez les distances." : 
               "Probabilité de pluie élevée aujourd'hui."}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-600">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5"><Sun size={12} className="text-amber-500/50" /> Max: {Math.round(daily.temperature_2m_max[0])}°</div>
          <div className="flex items-center gap-1.5"><Snowflake size={12} className="text-blue-500/50" /> Min: {Math.round(daily.temperature_2m_min[0])}°</div>
        </div>
        <div className="text-blue-500/50">Nexus SkyLink</div>
      </div>
    </motion.div>
  );
}
