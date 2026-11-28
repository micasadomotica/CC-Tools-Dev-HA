// Printer helpers shared by the "Programar impresiones" UI and its tests.
//
// cxy-gen2 detection: Creality Cloud only creates rateable print records
// (displayVersion "cxy-gen2" with id3mf, needed for the "Add Make" task) for
// new-generation printers that print 3MF through FlowPrint/FlowSlicer. The
// device list (getLimitDeviceList) gives no explicit generation flag, so we
// look at the model:
// - `printerModel` / `model`: the device's `model` ("Ender-3 V3"). The OctoPrint
//   virtual printer reports the M115 MACHINE_TYPE as its model.
// - `printerInterName`: deviceType.internalName. New models use opaque codes
//   (the Ender-3 V3 is "F001"), classic ones repeat the name ("Ender-3").
// `deviceType` (the numeric `type`) is 5 for both the classic Ender-3 and the
// Ender-3 V3, so it does not tell the generations apart.
export const CXY_GEN2_MODEL_PATTERNS = [
  /\bender[\s-]*3[\s-]*v3\b/i, // Ender-3 V3, V3 SE, V3 KE, V3 Plus
  /\bk1\b/i, // K1, K1C, K1 Max, K1 SE
  /\bk2\b/i // K2, K2 Plus, K2 Pro
];
// deviceType.internalName codes seen in Creality Cloud for gen2 printers.
export const CXY_GEN2_INTERNAL_NAMES = ['F001']; // F001 = Ender-3 V3

export function isCxyGen2Printer(printer = {}) {
  const internalName = String(printer.printerInterName || '').trim().toUpperCase();
  if (CXY_GEN2_INTERNAL_NAMES.includes(internalName)) return true;
  const names = [printer.printerInterName, printer.printerModel, printer.model]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return names.some((name) => CXY_GEN2_MODEL_PATTERNS.some((pattern) => pattern.test(name)));
}

// After "Actualizar impresoras", copy the fresh device metadata into the saved
// profiles of the same device. Without this, a printer whose model changed
// (e.g. the virtual printer switched from Ender-3 to Ender-3 V3, internal name
// "Ender-3" -> "F001", alias "HA Ender-3" -> "HA Ender-3 V3") keeps the old
// values and "Buscar GCODE" keeps asking for the old model.
export function refreshProfilesFromPrinters(profiles = [], printers = []) {
  return profiles.map((profile) => {
    const byDeviceId = Boolean(profile.printerDeviceId);
    const printer = printers.find((candidate) => byDeviceId
      ? String(candidate.deviceId || '') === String(profile.printerDeviceId)
      : candidate.name === profile.printerName);
    if (!printer) return profile;
    return {
      ...profile,
      printerName: (byDeviceId && printer.name) || profile.printerName,
      printerDeviceName: printer.deviceName || profile.printerDeviceName || '',
      printerTelemetryId: printer.telemetryId || profile.printerTelemetryId || '',
      printerInterName: printer.printerInterName || profile.printerInterName || '',
      printerModel: printer.model || profile.printerModel || '',
      printerDeviceType: printer.deviceType ?? profile.printerDeviceType ?? null,
      printerImageUrl: printer.imageUrl || profile.printerImageUrl || ''
    };
  });
}
