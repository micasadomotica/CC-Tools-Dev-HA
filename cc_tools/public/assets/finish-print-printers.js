// Printer helpers shared by the "Programar impresiones" UI and its tests.
//
// cxy-gen2 detection: Creality Cloud only creates rateable print records
// (displayVersion "cxy-gen2" with id3mf, needed for the "Add Make" task) for
// new-generation printers that print 3MF through FlowPrint/FlowSlicer. The
// device list (getLimitDeviceList / getDeviceGroups) gives no explicit
// generation flag, so we look at the model name that is already stored:
// `printerInterName` (deviceType.internalName, falling back to `model`) and,
// when the printer was just discovered, its `model`. The OctoPrint virtual
// printer reports the M115 MACHINE_TYPE as its model, so "Ender-3 V3" there
// makes it a gen2 printer. `deviceType` (the numeric `type`, 5 for both the
// classic Ender-3 and the Ender-3 V3 SE) does not tell the generations apart.
export const CXY_GEN2_MODEL_PATTERNS = [
  /\bender[\s-]*3[\s-]*v3\b/i, // Ender-3 V3, V3 SE, V3 KE, V3 Plus
  /\bk1\b/i, // K1, K1C, K1 Max, K1 SE
  /\bk2\b/i // K2, K2 Plus, K2 Pro
];

export function isCxyGen2Printer(printer = {}) {
  const names = [printer.printerInterName, printer.model, printer.printerModel]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return names.some((name) => CXY_GEN2_MODEL_PATTERNS.some((pattern) => pattern.test(name)));
}

// After "Actualizar impresoras", copy the fresh device metadata into the saved
// profiles of the same device. Without this, a printer whose model changed
// (e.g. the virtual printer switched from Ender-3 to Ender-3 V3) keeps its old
// printerInterName and "Buscar GCODE" keeps asking for the old model.
export function refreshProfilesFromPrinters(profiles = [], printers = []) {
  return profiles.map((profile) => {
    const printer = printers.find((candidate) => profile.printerDeviceId
      ? String(candidate.deviceId || '') === String(profile.printerDeviceId)
      : candidate.name === profile.printerName);
    if (!printer) return profile;
    return {
      ...profile,
      printerDeviceName: printer.deviceName || profile.printerDeviceName || '',
      printerTelemetryId: printer.telemetryId || profile.printerTelemetryId || '',
      printerInterName: printer.printerInterName || profile.printerInterName || '',
      printerDeviceType: printer.deviceType ?? profile.printerDeviceType ?? null,
      printerImageUrl: printer.imageUrl || profile.printerImageUrl || ''
    };
  });
}
