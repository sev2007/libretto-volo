/*
  Configurazione predefinita dell'app.

  supabaseUrl e supabaseKey possono restare vuoti: in questo caso si inseriscono
  dall'interfaccia dell'app su ciascun dispositivo.

  Per preconfigurare tutti i dispositivi puoi compilare:
  - supabaseUrl con il Project URL, per esempio https://xxxx.supabase.co
  - supabaseKey esclusivamente con la Publishable key sb_publishable_...

  Non inserire mai service_role, sb_secret_ o altre chiavi segrete.
*/
window.LIBRETTO_CONFIG = {
  supabaseUrl: "https://IL-TUO-PROGETTO.supabase.co",
  supabaseKey: "sb_publishable_INSERISCI_QUI_LA_CHIAVE",
  defaultPilot: "Walter Mondani",
  defaultAircraftModel: "RV-7",
  defaultRegistration: "I-DAVE"
};
