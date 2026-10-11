// NEEDS NATIVE-SPEAKER REVIEW BEFORE USE
// Simple administrative Hindi. Numerals stay 0-9 and units stay as in English (mg/l).
// Do not use: सुरक्षित, स्वच्छ, बीमारी, रोग (the wording lint rejects them).
import type { Strings } from "./en";

export const hi: Strings = {
  lang: "hi",
  tier: {
    critical: "अति गंभीर",
    high: "उच्च",
    moderate: "मध्यम",
    lower: "जाँची गई रीडिंग में कम चिंता",
  },
  confidence: { high: "उच्च", medium: "मध्यम", low: "कम" },
  action: {
    aeration: "वातन (एरेशन) प्राथमिकता",
    cleaning: "सफाई / जैविक कचरा हटाने की प्राथमिकता",
    ph: "pH की दोबारा जाँच",
    test: "विसर्जन से पहले जाँच",
  },
  actionWhy: {
    aeration: "सुझाव इसलिए कि कम से कम एक रीडिंग में घुलित ऑक्सीजन 5 mg/l से कम थी।",
    cleaning: "सुझाव इसलिए कि विसर्जन के दौरान या बाद में BOD 3 mg/l से अधिक था।",
    ph: "सुझाव इसलिए कि कम से कम एक रीडिंग में pH 6.5 से 8.5 के बाहर था।",
    test: "सुझाव इसलिए कि इस घाट के बारे में राय बनाने के लिए रीडिंग बहुत कम हैं।",
  },
  insufficient: {
    fewReadings: "6 से कम उपयोगी रीडिंग",
    noDuringDO: "विसर्जन के दौरान घुलित ऑक्सीजन की कोई रीडिंग नहीं",
    noDuringBOD: "विसर्जन के दौरान BOD की कोई रीडिंग नहीं",
  },
  ghatName: (site, nameHi) => (nameHi ? `${nameHi} (${site})` : site),
  doZero: (n) => `घुलित ऑक्सीजन (DO) ${n} रीडिंग में 0 mg/l रही (सीमा: 5 या अधिक)।`,
  doLow: (fail, valid, min) =>
    `घुलित ऑक्सीजन (DO) ${valid} में से ${fail} रीडिंग में 5 mg/l की सीमा से कम रही (न्यूनतम ${min} mg/l)।`,
  doOk: (valid) => `घुलित ऑक्सीजन (DO) सभी ${valid} रीडिंग में सीमा के भीतर रही।`,
  bodHigh: (fail, valid, max) =>
    `BOD ${valid} में से ${fail} रीडिंग में 3 mg/l की सीमा से अधिक रहा (अधिकतम ${max} mg/l)।`,
  bodOk: (valid) => `BOD सभी ${valid} रीडिंग में सीमा के भीतर रहा।`,
  phOut: (out, valid) => `pH ${valid} में से ${out} रीडिंग में 6.5 से 8.5 की सीमा से बाहर रहा।`,
  preFail: (fail, valid) =>
    `विसर्जन से पहले की ${valid} में से ${fail} रीडिंग पहले से ही सीमा से बाहर थीं।`,
  coverage: (conf, valid, expected, missing) =>
    `डेटा कवरेज: ${conf} (अपेक्षित ${expected} में से ${valid} रीडिंग` +
    (missing.length ? `; ${missing.join(", ")} की तालिका रिपोर्ट में नहीं है` : "") +
    ")।",
  tierChange: "गणना की विधि बदलने पर श्रेणी बदल जाती है, इसलिए इस रैंक को नज़दीकी मामला मानें।",
  twoPlaces: "ये दो अलग स्थान हो सकते हैं। कार्रवाई से पहले BMC से पुष्टि करें।",
  briefTitle: "विसर्जन घाट वॉच, भोपाल: अधिकारी ब्रीफ",
  prepared: (date, visarjan) => `तैयार: ${date}। दुर्गा विसर्जन: ${visarjan}।`,
  basedOn: (readings, ghats, y0, y1) =>
    `${ghats} घाटों की ${readings} अपलोड की गई रीडिंग पर आधारित, ${y0 === y1 ? y0 : `${y0} से ${y1}`}।`,
  priorityHead: "प्राथमिकता वाले घाट (पिछली जल-जाँच के आधार पर)",
  confidenceLabel: (conf) => `डेटा पर भरोसा: ${conf}।`,
  unrankedHead: "रैंक नहीं किए जा सके: विसर्जन से पहले जाँच करें",
  unrankedNone: (n) => `कोई नहीं। सभी ${n} घाटों में रैंक के लिए पर्याप्त रीडिंग थीं।`,
  actionsHead: "सुझाई गई कार्रवाई (केवल सुझाव; निर्णय अधिकारी का)",
  notShownHead: "यह ब्रीफ क्या नहीं बताता",
  notShown: (notSampled) =>
    `केवल लिए गए नमूनों की रीडिंग; ${notSampled} रीडिंग के नमूने नहीं लिए गए और उन्हें पास नहीं गिना गया। ` +
    `स्वास्थ्य संबंधी कोई निष्कर्ष नहीं। मानक CPCB Class B (बाहरी स्नान) है, जो हमारी धारणा है। ` +
    `इकाइयाँ मानी गई हैं; रिपोर्ट में इकाइयाँ नहीं छपी हैं।`,
  aiDraftNote: (n) =>
    `${n} रीडिंग AI मॉडल ने PDF से पढ़ी हैं; कार्रवाई से पहले रिपोर्ट से इनका मिलान करें।`,
  source: (years) => `स्रोत: MPPCB विसर्जन निगरानी रिपोर्ट ${years}।`,
  summaryTitle: "विसर्जन घाट वॉच, भोपाल: अधिकारी के लिए सारांश",
  inShortHead: "संक्षेप में",
  inShort: (a) =>
    `अपलोड की गई रीडिंग में ${a.ghats} घाट मिले; ${a.ranked} को रैंक किया जा सका और ${a.unranked} को नहीं। ` +
    (a.critical > 0 ? `${a.critical} घाट "अति गंभीर" श्रेणी में: ${a.criticalNames}। ` : "") +
    `सभी घाटों को मिलाकर, घुलित ऑक्सीजन ${a.doValid} में से ${a.doFail} रीडिंग में 5 mg/l की सीमा से कम रही ` +
    `और BOD ${a.bodValid} में से ${a.bodFail} रीडिंग में 3 mg/l की सीमा से अधिक रहा। ` +
    `${a.notSampled} रीडिंग के नमूने नहीं लिए गए; उन्हें "उपलब्ध नहीं" दिखाया गया है और पास नहीं गिना गया।`,
  col: {
    rank: "रैंक",
    ghat: "घाट",
    tier: "श्रेणी",
    confidence: "डेटा पर भरोसा",
    readings: "रीडिंग क्या दिखाती हैं",
    action: "सुझाई गई कार्रवाई",
  },
  rankRange: (rank, min, max) => (min === max ? `${rank}` : `${rank} (विधियों में ${min} से ${max})`),
  dataChecksHead: "अपलोड की गई फ़ाइलों की जाँच",
  dataChecks: (files, readings, notSampled, bdl, warnings) =>
    `${files} फ़ाइल, ${readings} रीडिंग स्वीकार। ${notSampled} के नमूने नहीं लिए गए, ` +
    `${bdl} पहचान-सीमा से नीचे (BDL), ${warnings} चेतावनी।`,
  hindiReview: "हिंदी पाठ की समीक्षा किसी हिंदी जानकार से कराना बाकी है।",
  aiLabel: (provider) => `शब्द ${provider} के; हर संख्या की जाँच कोड ने की।`,
};
