export const briefingCopy = {
  weatherUnavailable: 'Får ikke hentet værmeldingen nå.',
  warningsUnavailable: 'Får ikke sjekket varsler nå.',
  travelTimeUnavailable: 'Får ikke beregnet reisetiden nå.',
  batteryUnavailable: 'Får ikke sjekket batteriet nå.',
  chargingUnavailable: 'Får ikke sjekket ladingen nå.',
  chargerConnectedNotCharging: 'Hjemmeladeren er tilkoblet, men bilen lader ikke.',
  chargerInUse: 'Hjemmeladeren er i bruk.',
  inferredAndreasCharging: 'Det ser ut som Andreas sin bil lader hjemme.',
  confirmedAndreasCharging: 'Andreas sin bil lader hjemme.',
  noForecast: 'Får ikke hentet værmeldingen nå.',
  partialForecast: (time: string) => `Har værmelding frem til kl. ${time}.`,
} as const;
