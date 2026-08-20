const radians = Math.PI / 180;
const dayMilliseconds = 86_400_000;
const julianUnixEpoch = 2_440_588;
const julianJ2000 = 2_451_545;
const obliquity = radians * 23.4397;

export const dashboardLocation = {
  name: 'Sandefjord',
  latitude: 59.1312,
  longitude: 10.2166,
} as const;

export type SkyPosition = {
  altitude: number;
  azimuth: number;
};

export type MoonPosition = SkyPosition & {
  distance: number;
};

export type MoonIllumination = {
  fraction: number;
  phase: number;
};

export type SunEvents = {
  rising?: Date;
  setting?: Date;
};

const toDays = (date: Date) => date.valueOf() / dayMilliseconds - 0.5 + julianUnixEpoch - julianJ2000;
const rightAscension = (longitude: number, latitude: number) => Math.atan2(
  Math.sin(longitude) * Math.cos(obliquity) - Math.tan(latitude) * Math.sin(obliquity),
  Math.cos(longitude),
);
const declination = (longitude: number, latitude: number) => Math.asin(
  Math.sin(latitude) * Math.cos(obliquity) + Math.cos(latitude) * Math.sin(obliquity) * Math.sin(longitude),
);
const siderealTime = (days: number, westLongitude: number) => radians * (280.16 + 360.9856235 * days) - westLongitude;
const altitude = (hourAngle: number, latitude: number, dec: number) => Math.asin(
  Math.sin(latitude) * Math.sin(dec) + Math.cos(latitude) * Math.cos(dec) * Math.cos(hourAngle),
);
const azimuth = (hourAngle: number, latitude: number, dec: number) => Math.atan2(
  Math.sin(hourAngle),
  Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(dec) * Math.cos(latitude),
);
const normalizeDegrees = (degrees: number) => (degrees % 360 + 360) % 360;

const solarMeanAnomaly = (days: number) => radians * (357.5291 + 0.98560028 * days);
const eclipticLongitude = (meanAnomaly: number) => {
  const center = radians * (
    1.9148 * Math.sin(meanAnomaly)
    + 0.02 * Math.sin(2 * meanAnomaly)
    + 0.0003 * Math.sin(3 * meanAnomaly)
  );
  return meanAnomaly + center + radians * 102.9372 + Math.PI;
};
const sunCoordinates = (days: number) => {
  const longitude = eclipticLongitude(solarMeanAnomaly(days));
  return { declination: declination(longitude, 0), rightAscension: rightAscension(longitude, 0) };
};

const moonCoordinates = (days: number) => {
  const meanLongitude = radians * (218.316 + 13.176396 * days);
  const meanAnomaly = radians * (134.963 + 13.064993 * days);
  const meanDistance = radians * (93.272 + 13.22935 * days);
  const longitude = meanLongitude + radians * 6.289 * Math.sin(meanAnomaly);
  const latitude = radians * 5.128 * Math.sin(meanDistance);
  return {
    declination: declination(longitude, latitude),
    distance: 385_001 - 20_905 * Math.cos(meanAnomaly),
    rightAscension: rightAscension(longitude, latitude),
  };
};

export const getSunPosition = (
  date: Date,
  latitude: number = dashboardLocation.latitude,
  longitude: number = dashboardLocation.longitude,
): SkyPosition => {
  const westLongitude = -longitude * radians;
  const latitudeRadians = latitude * radians;
  const days = toDays(date);
  const coordinates = sunCoordinates(days);
  const hourAngle = siderealTime(days, westLongitude) - coordinates.rightAscension;
  return {
    altitude: altitude(hourAngle, latitudeRadians, coordinates.declination) / radians,
    azimuth: normalizeDegrees(azimuth(hourAngle, latitudeRadians, coordinates.declination) / radians + 180),
  };
};

export const getSunEvents = (
  date: Date,
  latitude: number = dashboardLocation.latitude,
  longitude: number = dashboardLocation.longitude,
): SunEvents => {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const targetAltitude = -0.833;
  const events: SunEvents = {};
  let previousTime = midnight.getTime();
  let previousAltitude = getSunPosition(new Date(previousTime), latitude, longitude).altitude - targetAltitude;
  for (let minutes = 10; minutes <= 24 * 60; minutes += 10) {
    const time = midnight.getTime() + minutes * 60_000;
    const currentAltitude = getSunPosition(new Date(time), latitude, longitude).altitude - targetAltitude;
    if (previousAltitude <= 0 && currentAltitude > 0 && !events.rising) {
      events.rising = new Date(refineCrossing(previousTime, time, latitude, longitude, targetAltitude));
    }
    if (previousAltitude >= 0 && currentAltitude < 0 && !events.setting) {
      events.setting = new Date(refineCrossing(previousTime, time, latitude, longitude, targetAltitude));
    }
    previousTime = time;
    previousAltitude = currentAltitude;
  }
  return events;
};

const refineCrossing = (
  start: number,
  end: number,
  latitude: number,
  longitude: number,
  targetAltitude: number,
) => {
  const rising = getSunPosition(new Date(end), latitude, longitude).altitude
    > getSunPosition(new Date(start), latitude, longitude).altitude;
  let low = start;
  let high = end;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) / 2;
    const above = getSunPosition(new Date(middle), latitude, longitude).altitude >= targetAltitude;
    if (above === rising) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
};

export const getMoonPosition = (
  date: Date,
  latitude: number = dashboardLocation.latitude,
  longitude: number = dashboardLocation.longitude,
): MoonPosition => {
  const westLongitude = -longitude * radians;
  const latitudeRadians = latitude * radians;
  const days = toDays(date);
  const coordinates = moonCoordinates(days);
  const hourAngle = siderealTime(days, westLongitude) - coordinates.rightAscension;
  const geocentricAltitude = altitude(hourAngle, latitudeRadians, coordinates.declination);
  const horizontalParallax = Math.asin(6_378.14 / coordinates.distance);
  const topocentricAltitude = Math.atan2(
    Math.sin(geocentricAltitude) - Math.sin(horizontalParallax),
    Math.cos(geocentricAltitude),
  );
  return {
    altitude: topocentricAltitude / radians,
    azimuth: normalizeDegrees(azimuth(hourAngle, latitudeRadians, coordinates.declination) / radians + 180),
    distance: coordinates.distance,
  };
};

export const getMoonIllumination = (date: Date): MoonIllumination => {
  const days = toDays(date);
  const sun = sunCoordinates(days);
  const moon = moonCoordinates(days);
  const sunDistance = 149_598_000;
  const elongation = Math.acos(
    Math.sin(sun.declination) * Math.sin(moon.declination)
    + Math.cos(sun.declination) * Math.cos(moon.declination) * Math.cos(sun.rightAscension - moon.rightAscension),
  );
  const incidence = Math.atan2(
    sunDistance * Math.sin(elongation),
    moon.distance - sunDistance * Math.cos(elongation),
  );
  const angle = Math.atan2(
    Math.cos(sun.declination) * Math.sin(sun.rightAscension - moon.rightAscension),
    Math.sin(sun.declination) * Math.cos(moon.declination)
      - Math.cos(sun.declination) * Math.sin(moon.declination) * Math.cos(sun.rightAscension - moon.rightAscension),
  );
  return {
    fraction: (1 + Math.cos(incidence)) / 2,
    phase: 0.5 + 0.5 * incidence * (angle < 0 ? -1 : 1) / Math.PI,
  };
};
