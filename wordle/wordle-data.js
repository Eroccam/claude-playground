/* global window */
(function () {
  const DEFAULT_LINK = 'https://www.safran-group.com/products-services?companies=6184';
  const LINKS = {
    APIRS: 'https://www.safran-group.com/products-services/apirs-most-efficient-attitude-and-heading-reference-system',
    GADIRS: 'https://www.safran-group.com/products-services?search=gadirs',
    GEONYX: 'https://www.safran-group.com/products-services/geonyxtm-m-inertial-navigation-system-amphibious-and-speed-boats-vehicles',
    ARGONYX: 'https://www.safran-group.com/products-services/argonyxtm-high-performance-inertial-navigation-system-surface-vessels',
    SKYNAUTE: 'https://www.safran-group.com/fr/produits-services/skynaute',
    VERSASYNC: 'https://www.safran-group.com/products-services/versasync-rugged-gnss-time-frequency-system',
    SECURESYNC: 'https://www.safran-group.com/products-services/securesync-time-frequency-reference-system',
    VAMPIR: 'https://www.safran-group.com/products-services/vampir-ng',
    EUROFLIR: 'https://www.safran-group.com/products-services/euroflirtm-610-european-electro-optical-system',
    PASEO: 'https://www.safran-group.com/products-services/paseo-long-range-panoramic-targeting-sight-land-vehicles',
    SKYDEL: 'https://www.safran-group.com/products-services/skydel-gsg-8-advanced-gnss-simulator',
    GSGEIGHT: 'https://www.safran-group.com/products-services/skydel-gsg-8-gen2-gnss-simulator',
    WHITERAB: 'https://www.safran-group.com/products-services?search=White%20Rabbit',
    WRZETTA: 'https://www.safran-group.com/products-services?search=WR-ZEN',
  };

  const DEFINITIONS = {
    APIRS: 'Safran attitude and heading reference system that supplies roll, pitch and heading data for aircraft.',
    GADIRS: 'GNSS-aided data and inertial reference concept used for robust aircraft navigation.',
    GEONYX: 'Safran inertial navigation family for vehicles operating in demanding or GNSS-denied environments.',
    ARGONYX: 'Safran naval inertial navigation system for accurate surface-vessel attitude and localization.',
    SKYNAUTE: 'Safran hybrid inertial/GNSS navigation system for aircraft, helicopters and drones.',
    NAVPULSE: 'Navigation pulse concept for precise timing signals used by PNT equipment.',
    VERSASYNC: 'Safran rugged GNSS time and frequency server for tactical mission synchronization.',
    SECURESYNC: 'Safran time and frequency reference platform for resilient infrastructure synchronization.',
    BLACKNAUTE: 'Safran submarine navigation naming related to the Black-Onyx inertial navigation family.',
    BLACKONYX: 'Safran naval inertial navigation naming associated with submerged or protected platforms.',
    VIGEO: 'Optronic observation term associated with stabilized visual surveillance payloads.',
    PASEO: 'Safran long-range panoramic targeting sight for armored and land-combat vehicles.',
    VAMPIR: 'Safran naval infrared search and track system for passive panoramic threat detection.',
    EUROFLIR: 'Safran long-range electro-optical system for surveillance, targeting and reconnaissance missions.',
    MOSKITO: 'Compact target location and observation optic used in field reconnaissance contexts.',
    VECTOR: 'Direction and magnitude quantity used for navigation, pointing and sensor alignment.',
    TERRAPIN: 'Ruggedized positioning or platform concept suited to field and land navigation applications.',
    TOTEM: 'Compact inertial navigation unit naming used for autonomous land and mission positioning.',
    SEEING: 'Vision and sensing capability for detecting, identifying and understanding the operating environment.',
    HAMMER: 'Safran-related AASM/HAMMER guided air-to-ground weapon family naming.',
    RUBIS: 'French for ruby; relevant to precision optical, laser and defense naming contexts.',
    ANETO: 'Safran helicopter engine family name used for high-power rotorcraft propulsion.',
    ARRANO: 'Safran helicopter engine family for light and intermediate rotorcraft.',
    ARRIEL: 'Safran turboshaft engine family widely used in helicopter applications.',
    ARRIUS: 'Safran turboshaft engine family for light twin-engine helicopters.',
    ARDIDEN: 'Safran helicopter engine family for medium rotorcraft.',
    MAKILA: 'Safran turboshaft engine family used on heavy helicopter platforms.',
  };

  const RAW_WORDS = `APIRS, GADIRS, GEONYX, ARGONYX, SKYNAUTE, NAVPULSE, VERSASYNC, SECURESYNC, BLACKNAUTE, BLACKONYX, VIGEO, PASEO, VAMPIR, EUROFLIR, MOSKITO, VECTOR, TERRAPIN, TOTEM, SEEING, HAMMER, RUBIS, ANETO, ARRANO, ARRIEL, ARRIUS, ARDIDEN, MAKILA, GNSS, NAVWAR, SPOOFING, JAMMING, GALILEO, NAVSTAR, TACAN, LORAN, VORTAC, RINEX, OSNMA, MEACON, INERTIA, INERTIAL, AVIONIC, OPTRONIC, TIMING, QUARTZ, ATOMIC, RUBIDIUM, CESIUM, MASER, GYROS, GYROSCOP, LASERS, PAYLOAD, THERMAL, TARGET, SEEKER, RADOME, SENSOR, SATCOM, AIRDATA, ALTIMET, BEACON, DATALINK, DEFENSE, MISSILE, WARHEAD, GUIDANCE, TRACKER, IMAGING, PNTSYS, RESILNT, RESOLVE, AUTONOM, TELEMET, ANTENNA, SIGNALS, ENCRYPT, CYBER, DRONES, UPLINK, DOWNLINK, SYNCHRO, CLOCKED, HOLDOVER, OSCILLAT, PHASED, RANGING, SURVEIL, AIRBORN, AIRSPACE, FUSION, SCALING, MAPPING, VECTORS, RADAR, SONAR, PULSAR, SATNAV, GPSDENY, ANTIJAM, COUNTER, SHIELD, FIRECTL, VISION, DAYNIGHT, COMBAT, TACTICS, STRIKE, BATTLE, PATROL, SECURED, NETWORK, UHFNAV, LIDARS, IMUNITY, RUGGED, OPTICAL, INFRARED, THRUST, TURBINE, ROTARY, ENGINE, PROPJET, FUELSYS, AIRFRAME, AEROSYS, SATTIME, SYNCTEC, POSITION, NAVIGATE, LOCATOR, ORBITAL, GEOLOCK, GUIDED, RAILGUN, CRUISEM, MUNITON, STEALTH, RECON, TRACKING, INTERFER, DENIAL, JAMRES, SPOOFRES, TIMECODE, WAVEFORM, MODULATE, BANDPASS, RECEIVER, EMITTER, TRANSMIT, LOWJITR, PICOSEC, FREQREF, CLOCKING, DETERMIN, UTCSYNC, PTPMODE, NTPTIME, RAFSMOD, SKYDEL, GSGEIGHT, SIMULATE, TESTBED, CALIBRAT, MONITOR, ANALYZE, GEOPOINT, AUTOPILT, WAYPOINT, AIRSPEED, ELEVATE, STABILIZ, FLIGHT, JETFUEL, RUNWAYS, AIRPORT, BULLSEYE, COMLINK, DATARATE, PROTOCOL, WHITEBIT, WHITERAB, WRZETTA, TIMEBASE, CHRONOS, SYNCING, TRAJECT, VELOCITY, ATTITUDE, HEADING, ORIENT, SATLOCK, GEODETIC, EPHEMER, CONSTELL, TRILATER, COORDSYS`
    .split(',')
    .map((word) => word.trim());

  function definitionFor(word) {
    if (DEFINITIONS[word]) return DEFINITIONS[word];
    if (/SYNC|TIME|CLOCK|UTC|NTP|PTP|FREQ|JITR|PICO|HOLD|OSC|QUARTZ|ATOMIC|RUBIDIUM|CESIUM|MASER|CHRONOS/.test(word)) {
      return `${word} is a precision timing term used to keep mission systems, networks and sensors synchronized.`;
    }
    if (/GNSS|GPS|NAV|LOCAT|GEO|ORBIT|EPHEMER|CONSTELL|TRILATER|COORD|WAYPOINT|POSITION|RANGING|SAT/.test(word)) {
      return `${word} relates to resilient positioning, navigation and timing for aerospace and defense operations.`;
    }
    if (/JAM|SPOOF|DENY|CYBER|ENCRYPT|SECURE|SHIELD|COUNTER|IMMUNITY|RESIL/.test(word)) {
      return `${word} describes protection or resilience against electronic, cyber or navigation threats.`;
    }
    if (/OPTRON|VISION|OPTIC|INFRA|THERM|LASER|LIDAR|IMAG|SEEK|TARGET|SENSOR|RADOME|DAYNIGHT/.test(word)) {
      return `${word} is associated with optronic sensing, imaging or target acquisition in defense systems.`;
    }
    if (/ENGINE|THRUST|TURBINE|ROTARY|FUEL|AIRFRAME|AERO|PROPJET|JET/.test(word)) {
      return `${word} relates to aircraft propulsion, airframe integration or flight-system performance.`;
    }
    if (/MISSILE|WARHEAD|GUID|STRIKE|BATTLE|COMBAT|TACTIC|PATROL|FIRE|MUNIT|CRUISE|STEALTH|RECON|RAIL/.test(word)) {
      return `${word} is a defense operations term connected to guided effects, mission control or tactical awareness.`;
    }
    if (/DATA|LINK|COM|UHF|PROTOCOL|NETWORK|TRANSMIT|RECEIVER|EMITTER|SIGNAL|WAVE|BAND/.test(word)) {
      return `${word} relates to mission communications, signal transport or radio-frequency system behavior.`;
    }
    return `${word} is a Safran-themed aerospace and defense term used in navigation, sensing, timing or mission systems.`;
  }

  function linkFor(word) {
    return LINKS[word] || DEFAULT_LINK;
  }

  window.SAFRAN_WORDLE = {
    startDate: '2026-05-15',
    words: RAW_WORDS.map((word) => ({
      word,
      definition: definitionFor(word),
      link: linkFor(word),
    })),
  };
}());
