import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.boiteagants.app',
  appName: 'Boite à Gants AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
