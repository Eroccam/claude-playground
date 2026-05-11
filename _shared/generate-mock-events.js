/**
 * generate-mock-events.js
 * Generates a realistic 168-event events.json matching PRD statistics.
 * Run: node _shared/generate-mock-events.js
 * (Delete this file once the real CSV is available and parse-events.js is used instead.)
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'data', 'events.json');

// ─── Show Data ────────────────────────────────────────────────────────────────
const USA_SHOWS = [
  {t:'Surface Navy Association Annual Symposium',c:'SNA26',ci:'Arlington',st:'VA',co:'USA',v:'Crystal Gateway Marriott',s:'2026-01-13',e:'2026-01-15',o:'SNA'},
  {t:'SHOT Show 2026',c:'SHOT26',ci:'Las Vegas',st:'NV',co:'USA',v:'Sands Expo Convention Center',s:'2026-01-21',e:'2026-01-24',o:'NSSF'},
  {t:'Modern Day Marine',c:'MDM26',ci:'Quantico',st:'VA',co:'USA',v:'Marine Corps Base Quantico',s:'2026-02-03',e:'2026-02-05',o:'Marine Corps'},
  {t:'WEST 2026',c:'WEST26',ci:'San Diego',st:'CA',co:'USA',v:'San Diego Convention Center',s:'2026-02-10',e:'2026-02-12',o:'AFCEA/USNI'},
  {t:'ION ITM 2026',c:'ITM26',ci:'Long Beach',st:'CA',co:'USA',v:'Hyatt Regency Long Beach',s:'2026-01-26',e:'2026-01-29',o:'ION'},
  {t:'GeoIntelligence Americas',c:'GIA26',ci:'San Antonio',st:'TX',co:'USA',v:'Henry B. Gonzalez CC',s:'2026-01-28',e:'2026-01-29',o:'Geospatial Media'},
  {t:'AFCEA WEST 2026',c:'AFWST26',ci:'San Diego',st:'CA',co:'USA',v:'San Diego Convention Center',s:'2026-02-17',e:'2026-02-19',o:'AFCEA'},
  {t:'AUSA Winter Symposium',c:'AUSAWINT26',ci:'Fort Lauderdale',st:'FL',co:'USA',v:'Broward Convention Center',s:'2026-02-24',e:'2026-02-26',o:'AUSA'},
  {t:'Satellite 2026',c:'SAT26',ci:'Washington',st:'DC',co:'USA',v:'Walter E. Washington Convention Center',s:'2026-03-09',e:'2026-03-12',o:'Via Satellite'},
  {t:'Border Security Expo',c:'BSE26',ci:'San Antonio',st:'TX',co:'USA',v:'Henry B. Gonzalez CC',s:'2026-03-17',e:'2026-03-19',o:'Border Security Assoc'},
  {t:'National Defense Industrial Association Forum',c:'NDIA26',ci:'Arlington',st:'VA',co:'USA',v:'Crystal City Marriott',s:'2026-03-24',e:'2026-03-26',o:'NDIA'},
  {t:'Sea-Air-Space 2026',c:'SAS26',ci:'National Harbor',st:'MD',co:'USA',v:'Gaylord National Resort',s:'2026-04-06',e:'2026-04-08',o:'Navy League'},
  {t:'Space Symposium 2026',c:'SPACE26',ci:'Colorado Springs',st:'CO',co:'USA',v:'Broadmoor Hotel',s:'2026-04-07',e:'2026-04-10',o:'Space Foundation'},
  {t:'ION Pacific PNT Conference',c:'IONPNT26',ci:'Honolulu',st:'HI',co:'USA',v:'Hilton Hawaiian Village',s:'2026-04-13',e:'2026-04-16',o:'ION'},
  {t:'Resilient Navigation and Timing Foundation Conference',c:'RNTF26',ci:'Dana Point',st:'CA',co:'USA',v:'Laguna Cliffs Marriott',s:'2026-04-20',e:'2026-04-22',o:'RNTF'},
  {t:'TechNet Cyber',c:'TCYBER26',ci:'Baltimore',st:'MD',co:'USA',v:'Baltimore Convention Center',s:'2026-04-21',e:'2026-04-23',o:'AFCEA'},
  {t:'Army Aviation Mission Solutions Summit',c:'AAMSS26',ci:'Nashville',st:'TN',co:'USA',v:'Opryland Hotel',s:'2026-04-28',e:'2026-04-30',o:'AAAA'},
  {t:'Directed Energy Professional Society Symposium',c:'DEPS26',ci:'Albuquerque',st:'NM',co:'USA',v:'Hyatt Regency Albuquerque',s:'2026-05-04',e:'2026-05-07',o:'DEPS'},
  {t:'Unmanned Systems Defence Conference USA',c:'UDC26',ci:'Washington',st:'DC',co:'USA',v:'Ronald Reagan Building',s:'2026-05-05',e:'2026-05-07',o:'SMi Group'},
  {t:'SOFIC 2026',c:'SOFIC26',ci:'Tampa',st:'FL',co:'USA',v:'Tampa Convention Center',s:'2026-05-18',e:'2026-05-21',o:'NDIA'},
  {t:'Electronic Warfare Technical Forum',c:'EWTF26',ci:'McLean',st:'VA',co:'USA',v:'Tysons Corner Marriott',s:'2026-05-19',e:'2026-05-20',o:'EW Research'},
  {t:'AUSA LANPAC Symposium',c:'LANPAC26',ci:'Honolulu',st:'HI',co:'USA',v:'Hilton Hawaiian Village',s:'2026-05-20',e:'2026-05-22',o:'AUSA'},
  {t:'GEOINT Symposium',c:'GEOINT26',ci:'St Louis',st:'MO',co:'USA',v:'Americas Center Convention Complex',s:'2026-06-01',e:'2026-06-04',o:'USGIF'},
  {t:'Special Operations Forces Industry Conference',c:'SOFC26',ci:'Tampa',st:'FL',co:'USA',v:'Tampa Convention Center',s:'2026-06-02',e:'2026-06-04',o:'SOCOM'},
  {t:'DSEI Americas',c:'DSEIA26',ci:'Washington',st:'DC',co:'USA',v:'National Harbor',s:'2026-06-16',e:'2026-06-18',o:'Clarion'},
  {t:'Pacific Defense Solutions Forum',c:'PDS26',ci:'Honolulu',st:'HI',co:'USA',v:'Hilton Hawaiian Village',s:'2026-07-14',e:'2026-07-16',o:'Pacific Defense'},
  {t:'Space and Missile Defense Symposium',c:'SMD26',ci:'Huntsville',st:'AL',co:'USA',v:'Von Braun Center',s:'2026-08-04',e:'2026-08-06',o:'SMDC'},
  {t:'C4ISR and Networks Conference',c:'C4ISR26',ci:'Arlington',st:'VA',co:'USA',v:'Crystal Gateway Marriott',s:'2026-08-11',e:'2026-08-13',o:'DefenseNews'},
  {t:'Ground Vehicle Systems Engineering Symposium',c:'GVSETS26',ci:'Novi',st:'MI',co:'USA',v:'Suburban Collection Showplace',s:'2026-08-11',e:'2026-08-13',o:'NDIA'},
  {t:'TechNet Augusta',c:'TNAUG26',ci:'Augusta',st:'GA',co:'USA',v:'Augusta Convention Center',s:'2026-08-17',e:'2026-08-19',o:'AFCEA'},
  {t:'APCO International Annual Conference',c:'APCO26',ci:'Atlanta',st:'GA',co:'USA',v:'Georgia World Congress Center',s:'2026-08-22',e:'2026-08-26',o:'APCO'},
  {t:'ION GNSS+ 2026',c:'IONGNSS26',ci:'Denver',st:'CO',co:'USA',v:'Colorado Convention Center',s:'2026-09-14',e:'2026-09-18',o:'ION'},
  {t:'Air Space and Cyber Conference',c:'ASC26',ci:'National Harbor',st:'MD',co:'USA',v:'Gaylord National Resort',s:'2026-09-15',e:'2026-09-17',o:'AFA'},
  {t:'AUSA Annual Meeting 2026',c:'AUSA26',ci:'Washington',st:'DC',co:'USA',v:'Walter E. Washington CC',s:'2026-10-12',e:'2026-10-14',o:'AUSA'},
  {t:'Defense One Summit',c:'DO26',ci:'Washington',st:'DC',co:'USA',v:'National Press Club',s:'2026-10-20',e:'2026-10-21',o:'Defense One'},
  {t:'AOC Annual Symposium',c:'AOC26',ci:'Washington',st:'DC',co:'USA',v:'Wardman Park Marriott',s:'2026-10-26',e:'2026-10-28',o:'AOC'},
  {t:'Defense Electronics Summit',c:'DES26',ci:'San Jose',st:'CA',co:'USA',v:'McEnery Convention Center',s:'2026-10-28',e:'2026-10-30',o:'Springer'},
  {t:'MILCOM 2026',c:'MIL26',ci:'Orlando',st:'FL',co:'USA',v:'Orange County Convention Center',s:'2026-11-02',e:'2026-11-05',o:'AFCEA/IEEE'},
  {t:'AFCEA TechNet Indo-Pacific',c:'TNIP26',ci:'Honolulu',st:'HI',co:'USA',v:'Hilton Hawaiian Village',s:'2026-11-16',e:'2026-11-19',o:'AFCEA'},
  {t:'I/ITSEC 2026',c:'IITSEC26',ci:'Orlando',st:'FL',co:'USA',v:'Orange County Convention Center',s:'2026-11-30',e:'2026-12-04',o:'NDIA'},
  {t:'Precision Strike Annual Review',c:'PSAR26',ci:'Arlington',st:'VA',co:'USA',v:'Crystal City Marriott',s:null,e:null,o:'JHU APL'},
  {t:'Navigation Innovation Leadership Summit',c:'NILS26',ci:'Denver',st:'CO',co:'USA',v:'Hyatt Regency Denver',s:null,e:null,o:'ION'},
  {t:'National Reconnaissance Office Industry Day',c:'NROID26',ci:'Chantilly',st:'VA',co:'USA',v:'NRO Campus',s:null,e:null,o:'NRO'},
  {t:'Army Future Command Symposium',c:'AFC26',ci:'Austin',st:'TX',co:'USA',v:'JW Marriott Austin',s:null,e:null,o:'AUSA'},
  {t:'PNT Advisory Board Industry Forum',c:'PNTAB26',ci:'Alexandria',st:'VA',co:'USA',v:'Mark Center',s:null,e:null,o:'DOT'},
  {t:'Tactical Intelligence Forum USA',c:'TIF26',ci:'Reston',st:'VA',co:'USA',v:'Reston Marriott',s:null,e:null,o:'IQPC'},
  {t:'SBIR/STTR Innovation Summit',c:'SBIR26',ci:'Washington',st:'DC',co:'USA',v:'National Press Club',s:null,e:null,o:'DoD'},
  {t:'Defense and Security Forum',c:'DSF26',ci:'Bethesda',st:'MD',co:'USA',v:'Bethesda North Marriott',s:null,e:null,o:'IQPC'},
  {t:'Homeland Security Emergency Management Forum',c:'HSEM26',ci:'Washington',st:'DC',co:'USA',v:'Ronald Reagan Building',s:null,e:null,o:'DHS'},
  {t:'Autonomous Vehicles Technology Expo USA',c:'AVTUSA26',ci:'Detroit',st:'MI',co:'USA',v:'TCF Center',s:null,e:null,o:'Terrapinn'},
  {t:'US Coast Guard Symposium',c:'USCG26',ci:'New London',st:'CT',co:'USA',v:'Coast Guard Academy',s:null,e:null,o:'USCG'},
  {t:'Communications Electronic Warfare Symposium',c:'CEWS26',ci:'Annapolis',st:'MD',co:'USA',v:'Westin Annapolis',s:null,e:null,o:'AFCEA'},
  {t:'Electronic Systems Technology Symposium',c:'ESTS26',ci:'Huntsville',st:'AL',co:'USA',v:'Huntsville Marriott',s:null,e:null,o:'NDIA'},
  {t:'Special Operations Support Conference',c:'SOSC26',ci:'Virginia Beach',st:'VA',co:'USA',v:'Virginia Beach Convention Center',s:null,e:null,o:'NDIA'},
  {t:'Army Sustainment Symposium',c:'ASS26',ci:'Fort Lee',st:'VA',co:'USA',v:'Fort Lee Officer Club',s:null,e:null,o:'AUSA'},
  {t:'Cyber Defense Summit',c:'CDS26',ci:'Washington',st:'DC',co:'USA',v:'Marriott Marquis',s:null,e:null,o:'SANS'},
  {t:'IDGA Future Soldier Technology Conference',c:'FST26',ci:'Washington',st:'DC',co:'USA',v:'Marriott Marquis',s:null,e:null,o:'IDGA'},
  {t:'Systems Technology Symposium',c:'STS26',ci:'San Diego',st:'CA',co:'USA',v:'San Diego Marriott Mission Valley',s:null,e:null,o:'NDIA'},
];

const EMEA_SHOWS = [
  {t:'International Armoured Vehicles',c:'IAV26',ci:'London',co:'UK',v:'QEII Centre',s:'2026-02-02',e:'2026-02-05',o:'Defence IQ'},
  {t:'Space Tech Europe',c:'STE26',ci:'Bremen',co:'Germany',v:'Messe Bremen',s:'2026-02-04',e:'2026-02-05',o:'Terrapinn'},
  {t:'World Defence Show 2026',c:'WDS26',ci:'Riyadh',co:'Saudi Arabia',v:'New Murabba Exhibition Centre',s:'2026-02-09',e:'2026-02-13',o:'Saudi Events'},
  {t:'IDEX 2026',c:'IDEX26',ci:'Abu Dhabi',co:'UAE',v:'Abu Dhabi National Exhibition Centre',s:'2026-02-23',e:'2026-02-27',o:'ADNEC'},
  {t:'NAVDEX 2026',c:'NAVDEX26',ci:'Abu Dhabi',co:'UAE',v:'Abu Dhabi National Exhibition Centre',s:'2026-02-23',e:'2026-02-27',o:'ADNEC'},
  {t:'Underwater Defence and Security',c:'UDS26',ci:'Portsmouth',co:'UK',v:'Portsmouth Guildhall',s:'2026-02-25',e:'2026-02-26',o:'UDS International'},
  {t:'ENFORCE Tac 2026',c:'ETAC26',ci:'Nuremberg',co:'Germany',v:'Messe Nuremberg',s:'2026-03-05',e:'2026-03-06',o:'Messe Nuremberg'},
  {t:'DIMDEX 2026',c:'DIMDEX26',ci:'Doha',co:'Qatar',v:'Qatar National Convention Centre',s:'2026-03-10',e:'2026-03-12',o:'Qatar Armed Forces'},
  {t:'DSEi Japan 2026',c:'DSEIJ26',ci:'Tokyo',co:'Japan',v:'Makuhari Messe',s:'2026-03-16',e:'2026-03-19',o:'Clarion'},
  {t:'SOFINS 2026',c:'SOFINS26',ci:'Bordeaux',co:'France',v:'Camp de Souge',s:'2026-03-25',e:'2026-03-27',o:'CIR'},
  {t:'Ocean Business 2026',c:'OCNBIZ26',ci:'Southampton',co:'UK',v:'National Oceanography Centre',s:'2026-04-07',e:'2026-04-09',o:'Underwater Vehicles'},
  {t:'Modern Warfare Conference Europe',c:'MWCE26',ci:'London',co:'UK',v:'QEII Centre',s:'2026-04-14',e:'2026-04-15',o:'IQPC'},
  {t:'GPSD 2026 Navigation Conference',c:'GPSD26',ci:'Munich',co:'Germany',v:'Westin Grand Munich',s:'2026-04-21',e:'2026-04-23',o:'ION'},
  {t:'Rome Advanced Navigation Forum',c:'RANF26',ci:'Rome',co:'Italy',v:'La Nuvola Convention Centre',s:'2026-05-19',e:'2026-05-21',o:'IQPC'},
  {t:'ITEC 2026 Training and Simulation',c:'ITEC26',ci:'Rotterdam',co:'Netherlands',v:'Rotterdam Ahoy',s:'2026-05-19',e:'2026-05-21',o:'Clarion'},
  {t:'Critical Infrastructure Protection Europe',c:'CIPE26',ci:'Berlin',co:'Germany',v:'Messe Berlin',s:'2026-05-12',e:'2026-05-14',o:'Clarion'},
  {t:'CANSEC 2026',c:'CANSEC26',ci:'Ottawa',co:'Canada',v:'EY Centre',s:'2026-05-27',e:'2026-05-28',o:'CADSI'},
  {t:'HEMUS 2026',c:'HEM26',ci:'Plovdiv',co:'Bulgaria',v:'International Fair Plovdiv',s:'2026-05-27',e:'2026-05-30',o:'International Fair'},
  {t:'ISDEF 2026',c:'ISDEF26',ci:'Tel Aviv',co:'Israel',v:'Tel Aviv Convention Center',s:'2026-06-03',e:'2026-06-05',o:'SIBAT'},
  {t:'KADEX 2026',c:'KADEX26',ci:'Nur-Sultan',co:'Kazakhstan',v:'EXPO 2017 Site',s:'2026-06-03',e:'2026-06-06',o:'Kazenergy'},
  {t:'DVD 2026',c:'DVD26',ci:'Millbrook',co:'UK',v:'Millbrook Proving Ground',s:'2026-06-10',e:'2026-06-12',o:'Clarion'},
  {t:'Eurosatory 2026',c:'EURO26',ci:'Paris',co:'France',v:'Paris Nord Villepinte',s:'2026-06-15',e:'2026-06-20',o:'Coges'},
  {t:'International Radar Symposium',c:'IRS26',ci:'Cologne',co:'Germany',v:'KoelnMesse',s:'2026-06-17',e:'2026-06-19',o:'DGON'},
  {t:'Sensor and Actuator Technology Summit EMEA',c:'SATS26',ci:'Amsterdam',co:'Netherlands',v:'RAI Amsterdam',s:'2026-06-23',e:'2026-06-24',o:'Terrapinn'},
  {t:'Autonomous Vehicles Technology Expo Europe',c:'AVTE26',ci:'Stuttgart',co:'Germany',v:'Messe Stuttgart',s:'2026-06-23',e:'2026-06-25',o:'Automotive IQ'},
  {t:'International Association of Geodesy Symposium',c:'IAG26',ci:'Vienna',co:'Austria',v:'Austria Center Vienna',s:'2026-07-06',e:'2026-07-10',o:'IAG'},
  {t:'Farnborough International Airshow',c:'FIA26',ci:'Farnborough',co:'UK',v:'Farnborough Airport',s:'2026-07-20',e:'2026-07-24',o:'FIA Ltd'},
  {t:'NDC Oslo 2026',c:'NDC26',ci:'Oslo',co:'Norway',v:'Oslo Militaere Samfund',s:'2026-01-13',e:'2026-01-15',o:'Norwegian MoD'},
  {t:'Intersec 2026',c:'INTSEC26',ci:'Dubai',co:'UAE',v:'Dubai World Trade Centre',s:'2026-01-20',e:'2026-01-22',o:'Messe Frankfurt'},
  {t:'African Aerospace and Defence',c:'AAD26',ci:'Pretoria',co:'South Africa',v:'AFB Waterkloof',s:'2026-09-09',e:'2026-09-13',o:'AAD'},
  {t:'DSEI 2026',c:'DSEI26',ci:'London',co:'UK',v:'ExCeL London',s:'2026-09-08',e:'2026-09-12',o:'Clarion'},
  {t:'MSPO 2026',c:'MSPO26',ci:'Kielce',co:'Poland',v:'Targi Kielce',s:'2026-09-08',e:'2026-09-11',o:'Targi Kielce'},
  {t:'DSEI Space',c:'DSEIS26',ci:'London',co:'UK',v:'ExCeL London',s:'2026-09-08',e:'2026-09-12',o:'Clarion'},
  {t:'SALT 2026',c:'SALT26',ci:'Cannes',co:'France',v:'Cannes Croisette',s:'2026-09-15',e:'2026-09-17',o:'SALT'},
  {t:'Signal Processing Symposium',c:'SPSY26',ci:'Warsaw',co:'Poland',v:'Warsaw University of Technology',s:'2026-09-17',e:'2026-09-19',o:'IEEE'},
  {t:'Ocean Technology Conference Europe',c:'OTCE26',ci:'Hamburg',co:'Germany',v:'Hamburg Messe',s:'2026-10-06',e:'2026-10-08',o:'OTC'},
  {t:'Euronaval 2026',c:'ENAV26',ci:'Paris',co:'France',v:'Paris Le Bourget',s:'2026-10-20',e:'2026-10-23',o:'GICAN'},
  {t:'Satellite Navigation Summit EMEA',c:'SNSE26',ci:'Brussels',co:'Belgium',v:'The EGG Brussels',s:'2026-11-10',e:'2026-11-12',o:'Euroconsult'},
  {t:'Milipol 2026',c:'MILPOL26',ci:'Paris',co:'France',v:'Paris Nord Villepinte',s:'2026-11-17',e:'2026-11-20',o:'Comexposium'},
  {t:'EDEX 2026 Egypt Defence Expo',c:'EDEX26',ci:'Cairo',co:'Egypt',v:'Egypt International Exhibition Centre',s:'2026-11-30',e:'2026-12-03',o:'Egyptian MoD'},
  {t:'EURONAVAL Digital Forum',c:'ENDIGI26',ci:'Paris',co:'France',v:'Salon des Industries Navales',s:null,e:null,o:'GICAN'},
  {t:'DSEI Middle East',c:'DSEIME26',ci:'Abu Dhabi',co:'UAE',v:'ADNEC',s:null,e:null,o:'Clarion'},
  {t:'Space Operations Symposium EMEA',c:'SOSEMEA26',ci:'Toulouse',co:'France',v:'Cite de lEspace',s:null,e:null,o:'ESA'},
  {t:'EUROCONTROL Navigation Workshop',c:'ECNAV26',ci:'Brussels',co:'Belgium',v:'EUROCONTROL HQ',s:null,e:null,o:'EUROCONTROL'},
  {t:'Maritime Unmanned Systems Conference',c:'MUSC26',ci:'Portsmouth',co:'UK',v:'Gunwharf Quays',s:null,e:null,o:'SMi'},
  {t:'Electronic and Cyber Warfare Conference',c:'ECWC26',ci:'London',co:'UK',v:'MOD Main Building',s:null,e:null,o:'RUSI'},
  {t:'NATO IST Symposium',c:'NATOITS26',ci:'The Hague',co:'Netherlands',v:'World Forum',s:null,e:null,o:'NATO STO'},
  {t:'SURV 2026 Reconnaissance Technology',c:'SURV26',ci:'London',co:'UK',v:'DSEI Hall ExCeL',s:null,e:null,o:'Clarion'},
  {t:'Precision Guided Munitions Forum EMEA',c:'PGMF26',ci:'London',co:'UK',v:'Royal Lancaster London',s:null,e:null,o:'Defence IQ'},
  {t:'Resilient Navigation Symposium Europe',c:'RNSE26',ci:'Amsterdam',co:'Netherlands',v:'RAI Amsterdam',s:null,e:null,o:'ION'},
  {t:'Modern Radar Summit EMEA',c:'MRSE26',ci:'London',co:'UK',v:'Hotel Russell London',s:null,e:null,o:'IQPC'},
  {t:'ESOC Industry Day',c:'ESOCID26',ci:'Darmstadt',co:'Germany',v:'ESOC Campus',s:null,e:null,o:'ESA'},
  {t:'UCAV and Air Combat Conference',c:'UCAV26',ci:'London',co:'UK',v:'QEII Centre',s:null,e:null,o:'Defence IQ'},
  {t:'Quantum Sensing Summit EMEA',c:'QSS26',ci:'London',co:'UK',v:'Science Museum London',s:null,e:null,o:'Quantum Flagship'},
  {t:'Air and Missile Defence Conference',c:'AMD26',ci:'London',co:'UK',v:'Lancaster London Hotel',s:null,e:null,o:'RUSI'},
  {t:'Baltic Security Conference',c:'BSC26',ci:'Tallinn',co:'Estonia',v:'Tallinn Creative Hub',s:null,e:null,o:'ICDS'},
  {t:'NavTech Summit EMEA',c:'NTSE26',ci:'Munich',co:'Germany',v:'Hilton Munich City',s:null,e:null,o:'ION'},
  {t:'ISR and Intelligence Summit Europe',c:'ISRE26',ci:'London',co:'UK',v:'Whitehall Conference Centre',s:null,e:null,o:'IQPC'},
  {t:'Nordic Security Conference',c:'NORDSEC26',ci:'Helsinki',co:'Finland',v:'Marina Congress Center',s:null,e:null,o:'Nordic Security'},
  {t:'COMDEF 2026',c:'COMDEF26',ci:'Jerusalem',co:'Israel',v:'Jerusalem Convention Center',s:null,e:null,o:'Israel MoD'},
  {t:'BSEC Black Sea Security Conference',c:'BSEC26',ci:'Istanbul',co:'Turkey',v:'Istanbul Congress Center',s:null,e:null,o:'BSEC'},
  {t:'Autonomous Systems Innovation Forum',c:'ASIF26',ci:'London',co:'UK',v:'One Eldon Square London',s:null,e:null,o:'Clarion'},
  {t:'IABG Systems Engineering Forum',c:'IABG26',ci:'Munich',co:'Germany',v:'IABG HQ Ottobrunn',s:null,e:null,o:'IABG'},
  {t:'Space Autonomy Summit Europe',c:'SASE26',ci:'Paris',co:'France',v:'Palais du Luxembourg',s:null,e:null,o:'ESA'},
  {t:'Navigation Systems and Services Forum',c:'NSSF26',ci:'Paris',co:'France',v:'Palais des Congres de Paris',s:null,e:null,o:'Euroconsult'},
  {t:'Critical Defence Systems Forum',c:'CDSF26',ci:'London',co:'UK',v:'RUSI Whitehall',s:null,e:null,o:'RUSI'},
  {t:'Underwater Vehicles Technology Conference',c:'UVTC26',ci:'London',co:'UK',v:'Institute of Acoustics',s:null,e:null,o:'IoA'},
  {t:'CRPG Navigation and Defence Forum',c:'CRPG26',ci:'Toulouse',co:'France',v:'ISAE-SUPAERO Campus',s:null,e:null,o:'CRPG'},
  {t:'NavAsia EMEA Exchange',c:'NAEEX26',ci:'Amsterdam',co:'Netherlands',v:'Hilton Amsterdam',s:null,e:null,o:'ION'},
  {t:'SOFEX 2026',c:'SOFEX26',ci:'Amman',co:'Jordan',v:'Al-Matar Military Complex',s:null,e:null,o:'Jordanian GHQ'},
  {t:'Inertial Sensors and Systems Symposium',c:'ISAS26',ci:'Karlsruhe',co:'Germany',v:'KIT Campus',s:null,e:null,o:'IEEE'},
  {t:'Space Debris Conference',c:'SDC26',ci:'Darmstadt',co:'Germany',v:'ESA ESOC Campus',s:null,e:null,o:'ESA'},
  {t:'AUS NZ Five Eyes Forum',c:'FVEYES26',ci:'London',co:'UK',v:'British-American Business Centre',s:null,e:null,o:'FiveEyes'},
  {t:'Electronic Navigation Research Forum',c:'ENRI26',ci:'Paris',co:'France',v:'ENRI Annex Paris',s:null,e:null,o:'ENRI'},
  {t:'Milipol Asia-Pacific EMEA',c:'MILAP26',ci:'Singapore',co:'Singapore',v:'Singapore Expo',s:null,e:null,o:'Comexposium'},
  {t:'Defence and Security EMEA Forum',c:'DSEF26',ci:'London',co:'UK',v:'Chatham House London',s:null,e:null,o:'RUSI'},
  {t:'IABG Navigation Technology Day',c:'IABGNTD26',ci:'Munich',co:'Germany',v:'IABG Site Ottobrunn',s:null,e:null,o:'IABG'},
  {t:'Space Industry Day EMEA',c:'SIDEMEA26',ci:'Brussels',co:'Belgium',v:'European Commission HQ',s:null,e:null,o:'ESA'},
  {t:'Global Navigation Satellite Systems Conference',c:'GNSSCONF26',ci:'Geneva',co:'Switzerland',v:'CICG Geneva',s:null,e:null,o:'ITU'},
  {t:'European Navigation Conference',c:'ENC26',ci:'Tampere',co:'Finland',v:'Tampere Hall',s:'2026-05-04',e:'2026-05-07',o:'ENC Org'},
];

const APAC_SHOWS = [
  {t:'Global Space and Technology Convention',c:'GSTC26',ci:'Singapore',co:'Singapore',v:'Marina Bay Sands',s:'2026-02-05',e:'2026-02-06',o:'Industry Connect'},
  {t:'Singapore Airshow 2026',c:'SINGA26',ci:'Singapore',co:'Singapore',v:'Changi Exhibition Centre',s:'2026-02-10',e:'2026-02-15',o:'Experia Events'},
  {t:'AVALON Australian International Airshow',c:'AVALON26',ci:'Geelong',co:'Australia',v:'Avalon Airport',s:'2026-02-24',e:'2026-03-01',o:'AMDA'},
  {t:'DSEI Japan 2026 APAC',c:'DSEIJAPAN26',ci:'Tokyo',co:'Japan',v:'Makuhari Messe',s:'2026-03-16',e:'2026-03-19',o:'Clarion'},
  {t:'Pacific Defence Summit',c:'PACDS26',ci:'Sydney',co:'Australia',v:'ICC Sydney',s:'2026-03-24',e:'2026-03-26',o:'Pacific Defence'},
  {t:'Indo-Pacific 2026',c:'INDOPAC26',ci:'Adelaide',co:'Australia',v:'Adelaide Convention Centre',s:'2026-05-10',e:'2026-05-12',o:'Navy League'},
  {t:'DefAus 2026',c:'DEFAUS26',ci:'Darwin',co:'Australia',v:'Darwin Convention Centre',s:'2026-07-07',e:'2026-07-09',o:'Diversified'},
  {t:'Defence Engage 2026',c:'DEFENG26',ci:'Canberra',co:'Australia',v:'National Convention Centre',s:'2026-08-18',e:'2026-08-19',o:'Aus DSA'},
  {t:'Land Forces 2026',c:'LF26',ci:'Brisbane',co:'Australia',v:'Brisbane Convention and Exhibition Centre',s:'2026-09-01',e:'2026-09-03',o:'AIDN'},
  {t:'Safety and Security Asia',c:'SSA26',ci:'Singapore',co:'Singapore',v:'Singapore Expo',s:'2026-09-15',e:'2026-09-17',o:'Reed'},
  {t:'ADEX Korea 2026',c:'ADEXK26',ci:'Seoul',co:'South Korea',v:'Seoul ADEX Airfield',s:'2026-10-19',e:'2026-10-23',o:'Korean AF'},
  {t:'Korea International Defence Industry Exhibition',c:'KDEX26',ci:'Changwon',co:'South Korea',v:'KINTEX',s:'2026-10-21',e:'2026-10-24',o:'KODEF'},
  {t:'Def-India 2026',c:'DEFIND26',ci:'New Delhi',co:'India',v:'Bharat Mandapam',s:'2026-10-28',e:'2026-11-01',o:'Indian MoD'},
  {t:'Indo Defence 2026',c:'INDOD26',ci:'Jakarta',co:'Indonesia',v:'Jakarta International Expo',s:'2026-11-04',e:'2026-11-07',o:'Wahana Catur'},
  {t:'Japan Air Show 2026',c:'JAS26',ci:'Gifu',co:'Japan',v:'Gifu Air Base',s:null,e:null,o:'SJAC'},
  {t:'Taiwan Defence Industry Forum',c:'TDIF26',ci:'Taipei',co:'Taiwan',v:'Taipei Nangang Exhibition Center',s:null,e:null,o:'Taiwan MoD'},
  {t:'IQDEX Asia-Pacific',c:'IQDEXAP26',ci:'Singapore',co:'Singapore',v:'Marina Bay Sands',s:null,e:null,o:'Clarion'},
  {t:'Asia Pacific Defence and Security',c:'APDS26',ci:'Manila',co:'Philippines',v:'SMX Convention Center',s:null,e:null,o:'Clarion'},
  {t:'Asia Pacific Unmanned Systems Forum',c:'APUSF26',ci:'Sydney',co:'Australia',v:'Sydney Olympic Park',s:null,e:null,o:'AUVSI APAC'},
  {t:'UDT Pacific',c:'UDTPAC26',ci:'Brisbane',co:'Australia',v:'Brisbane Convention Centre',s:null,e:null,o:'UDT'},
  {t:'Space Asia Forum',c:'SAF26',ci:'Singapore',co:'Singapore',v:'Raffles City Convention Centre',s:null,e:null,o:'Space Asia'},
  {t:'PNT Asia Summit',c:'PNTASIA26',ci:'Seoul',co:'South Korea',v:'Coex Convention Center',s:null,e:null,o:'ION Asia'},
  {t:'Milipol Asia-Pacific 2026',c:'MILAPAC26',ci:'Singapore',co:'Singapore',v:'Marina Bay Sands',s:null,e:null,o:'Comexposium'},
  {t:'NavAsia 2026',c:'NAVASIA26',ci:'Singapore',co:'Singapore',v:'ONE15 Marina Club Singapore',s:null,e:null,o:'ION'},
  {t:'India Ocean Defence Industry Expo',c:'IODIX26',ci:'Mumbai',co:'India',v:'MMRDA Grounds',s:null,e:null,o:'Indian MoD'},
  {t:'Euronaval APAC',c:'ENAPAC26',ci:'Tokyo',co:'Japan',v:'Tokyo Big Sight',s:null,e:null,o:'GICAN'},
  {t:'Digital Transformation in Defence APAC',c:'DTDAP26',ci:'Melbourne',co:'Australia',v:'Crown Melbourne',s:null,e:null,o:'Clarion'},
  {t:'Counter UAS Asia',c:'CUASAP26',ci:'Singapore',co:'Singapore',v:'Sands Expo and Convention Centre',s:null,e:null,o:'C-UAS World'},
  {t:'IQPC Aviation and Defense Forum APAC',c:'ADFAPAC26',ci:'Bangkok',co:'Thailand',v:'Centara Grand Convention Centre',s:null,e:null,o:'IQPC'},
  {t:'New Zealand Defence Industry Forum',c:'NZDIF26',ci:'Wellington',co:'New Zealand',v:'Te Papa Museum',s:null,e:null,o:'NZDIA'},
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function pickN(a, n) {
  const c = [...a]; shuffle(c);
  return c.slice(0, Math.min(n, c.length));
}

const STATUS_POOLS = {
  go:        ['GO', 'GO - Booth Confirmed', 'GO - Walking', 'Up to Date', 'WALKING SALES'],
  planning:  ['Planning', 'Planning - RFQ Sent', 'Planning - In Progress', 'Planning - Awaiting Budget'],
  pending:   ['PENDING', 'PENDING APPROVAL', 'DIVISION INTEREST'],
  tbc:       ['TBC SALES', 'TBC SDS', 'TBC SAFRAN GROUP'],
  cancelled: ['CANCELLED', 'NO GO'],
  other:     ['On Hold', 'Future Consideration', 'Monitoring', 'Deferred 2027', 'Under Review'],
};
const BIZ = ['ST4D','SDSI','SED Space','SED Defense','GNSS','Inertial Navigation','Timing','PNT','Navigation Systems','Atomic Clocks'];
const MOCKUPS = ['TSN-901','AFIRS 328','TSN-360','microIMU','ATLANS-C','OCEANO','IMU-120','PulSAR','GT-300','NAVSYS-7'];
const STAFF = ['CAMERON CHAMBERS','ALYSSA BROOKS','AWA DIALLO','SARAH CHEN','MIKE TORRES','JAMES WRIGHT'];
const SUBJECTS = ['GNSS Resilience','Inertial Navigation','PNT for Defense','Autonomous Navigation','Timing and Synchronisation','Multi-domain Operations','Navigation Warfare','Space-based PNT','Underwater Navigation','Anti-jam GNSS','Assured PNT','Precision Timing'];

// Shuffled plan arrays — deterministic count distributions
const statusPlan = shuffle([
  ...Array(61).fill('go'), ...Array(55).fill('planning'), ...Array(15).fill('pending'),
  ...Array(15).fill('tbc'), ...Array(4).fill('cancelled'), ...Array(18).fill('other'),
]);
const typePlan = shuffle([
  ...Array(87).fill('Walking'), ...Array(78).fill('Exhibition'),
  ...Array(2).fill('Speaking'), ...Array(1).fill('Seminar'),
]);
const sectorPlan = shuffle([
  ...Array(95).fill('ADG'), ...Array(69).fill('GCI'), ...Array(4).fill('Other'),
]);

const allShows = [
  ...USA_SHOWS.map(s => ({ ...s, region: 'USA', st: s.st || '' })),
  ...EMEA_SHOWS.map(s => ({ ...s, region: 'EMEA', st: '' })),
  ...APAC_SHOWS.map(s => ({ ...s, region: 'APAC', st: '' })),
];

const REF = new Date('2026-02-21T12:00:00Z');
const events = [];
let cameronI = 0, alyssaI = 0, awaI = 0, unI = 0;

allShows.forEach((show, gi) => {
  const sg     = statusPlan[gi];
  const et     = typePlan[gi];
  const sector = sectorPlan[gi];

  // Captain assignment: AWA=109(EMEA+APAC), CAMERON=36(USA), ALYSSA=22(USA), unassigned=1
  let captain = '';
  if (show.region === 'EMEA' || show.region === 'APAC') {
    if (awaI < 109) { captain = 'AWA'; awaI++; } else { captain = ''; unI++; }
  } else {
    if (cameronI < 36)      { captain = 'CAMERON'; cameronI++; }
    else if (alyssaI < 22)  { captain = 'ALYSSA';  alyssaI++;  }
    else                    { captain = '';         unI++;       }
  }

  const startDate = show.s || null;
  const endDate   = show.e || null;
  let daysUntilStart = null;
  if (startDate) {
    daysUntilStart = Math.round((new Date(startDate + 'T12:00:00Z') - REF) / 86400000);
  }
  let urgency = 'no-date';
  if (startDate !== null) {
    if (daysUntilStart < 0)        urgency = 'past';
    else if (daysUntilStart <= 14) urgency = 'critical';
    else if (daysUntilStart <= 30) urgency = 'soon';
    else if (daysUntilStart <= 120) urgency = 'upcoming';
    else                            urgency = 'future';
  }

  const isExhibition = et === 'Exhibition';
  const eventTypes = isExhibition
    ? (Math.random() > 0.4 ? ['Exhibition', 'Walking'] : ['Exhibition'])
    : [et];

  const shipByDate = (isExhibition && startDate)
    ? new Date(new Date(startDate + 'T12:00:00Z').getTime() - 30 * 86400000).toISOString().slice(0, 10)
    : null;
  const registrationDeadline = startDate
    ? new Date(new Date(startDate + 'T12:00:00Z').getTime() - 60 * 86400000).toISOString().slice(0, 10)
    : null;

  events.push({
    title: show.t,
    code: show.c,
    rank: String(Math.ceil(Math.random() * 3)),
    attendanceRecord: Math.random() > 0.5 ? 'Existing' : 'NEW',
    startDate,
    endDate,
    region: show.region,
    locationKnown: startDate ? 'Known' : 'Unknown',
    eventType: eventTypes,
    city: show.ci || '',
    state: show.st || '',
    country: show.co || '',
    venue: show.v || '',
    website: 'https://www.' + show.c.toLowerCase().replace(/\d+$/, '') + '.com',
    boothSize: isExhibition ? pick(['10 x 10', '20 x 10', '10 x 20', '20 x 20', '6 x 3']) : '',
    boothNumber: isExhibition ? pick(['A12', 'B24', 'C5', 'D101', 'E7', 'F33', 'H22']) : '',
    status: pick(STATUS_POOLS[sg]),
    statusGroup: sg,
    sector,
    organizingCompany: show.o || '',
    businessLines: pickN(BIZ, Math.floor(Math.random() * 3) + 1),
    showCaptain: captain,
    shipByDate,
    registrationDeadline,
    mockupsModels: isExhibition ? pickN(MOCKUPS, Math.floor(Math.random() * 3) + 1) : [],
    actionStatus: sg === 'go' ? 'Confirmed. Booth design approved. Logistics in progress.'
      : sg === 'planning' ? 'Awaiting budget sign-off. Initial contact made with organiser.'
      : sg === 'cancelled' ? 'Event cancelled - no further action required.'
      : 'Monitoring situation. Decision required before Q2 deadline.',
    subject: pick(SUBJECTS),
    notes: Math.random() > 0.5 ? 'Key ' + sector + ' event. Managed by ' + (captain || 'TBD') + '.' : '',
    daysUntilStart,
    staffAssigned: pickN(STAFF, Math.floor(Math.random() * 3) + 1),
    urgency,
  });
});

const output = {
  lastUpdated: '2026-02-21T08:00:00.000Z',
  totalEvents: events.length,
  events,
};

fs.writeFileSync(OUT, JSON.stringify(output, null, 2), 'utf8');

// Verification
const byR = {}, bySG = {}, byU = {};
events.forEach(e => {
  byR[e.region]   = (byR[e.region]   || 0) + 1;
  bySG[e.statusGroup] = (bySG[e.statusGroup] || 0) + 1;
  byU[e.urgency]  = (byU[e.urgency]  || 0) + 1;
});
console.log('Total events:', events.length);
console.log('Region:', JSON.stringify(byR));
console.log('Status:', JSON.stringify(bySG));
console.log('Urgency:', JSON.stringify(byU));
console.log('Captains: AWA=' + awaI + ' CAMERON=' + cameronI + ' ALYSSA=' + alyssaI + ' unassigned=' + unI);
console.log('Written to:', OUT);
