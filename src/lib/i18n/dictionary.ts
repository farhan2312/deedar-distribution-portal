import type { Lang } from "./config";

// English source strings ARE the keys. Only the Hindi overrides live here; any
// string not yet translated falls back to its English key, so partial coverage
// degrades gracefully. Add entries as screens get localized.
const HI: Record<string, string> = {
  // ── Auth: login ──
  "WELCOME BACK": "वापसी पर स्वागत है",
  "Login to continue to Deedar Drive": "जारी रखने के लिए Deedar Drive में लॉगिन करें",
  "Phone number": "मोबाइल नंबर",
  Password: "पासवर्ड",
  "Remember me": "मुझे याद रखें",
  "Forgot password?": "पासवर्ड भूल गए?",
  Login: "लॉगिन",
  "Logging in…": "लॉगिन हो रहा है…",
  "New to Deedar Drive?": "Deedar Drive पर नए हैं?",
  "Request Access": "एक्सेस का अनुरोध करें",
  "Something went wrong.": "कुछ गड़बड़ हो गई।",
  "Could not reach the server. Please try again.": "सर्वर से संपर्क नहीं हो सका। कृपया पुनः प्रयास करें।",

  // ── Auth: signup ──
  "REQUEST ACCESS": "एक्सेस का अनुरोध",
  "Ask Central Admin to set up your account": "अपना खाता बनवाने के लिए सेंट्रल एडमिन से अनुरोध करें",
  "Full name": "पूरा नाम",
  "Confirm password": "पासवर्ड की पुष्टि करें",
  "Role you're requesting": "आप जो भूमिका माँग रहे हैं",
  "Send request": "अनुरोध भेजें",
  "Sending…": "भेजा जा रहा है…",
  "Request sent!": "अनुरोध भेज दिया गया!",
  "Central Admin will review it. Once approved, log in with your mobile number and the password you just set.":
    "सेंट्रल एडमिन इसकी समीक्षा करेंगे। स्वीकृत होने पर, अपने मोबाइल नंबर और अभी सेट किए गए पासवर्ड से लॉगिन करें।",
  "Back to login →": "लॉगिन पर वापस →",
  "Already have an account?": "पहले से खाता है?",
  "Log in": "लॉगिन करें",

  // ── Sidebar: section titles ──
  "Field Salesman ISR": "फील्ड सेल्समैन ISR",
  "Sales Officer": "सेल्स ऑफिसर",
  Depot: "डिपो",
  "C&F Sales": "C&F बिक्री",
  "Kanpur HQ": "कानपुर मुख्यालय",
  "Central Admin": "सेंट्रल एडमिन",

  // ── Sidebar: nav items ──
  "Day Log": "दैनिक लॉग",
  Beat: "बीट",
  "New Counter": "नई दुकान",
  "Live map": "लाइव मैप",
  Analytics: "एनालिटिक्स",
  Exceptions: "अपवाद",
  "Assign Beat": "बीट सौंपें",
  "Assignment Summary": "असाइनमेंट सारांश",
  Counters: "दुकानें",
  Schemes: "स्कीम",
  Stock: "स्टॉक",
  Dashboard: "डैशबोर्ड",
  "Depots & Areas": "डिपो और क्षेत्र",
  "Company Dashboard": "कंपनी डैशबोर्ड",
  Hierarchy: "पदानुक्रम",
  "Users & access": "उपयोगकर्ता और एक्सेस",
  "Scheme codes": "स्कीम कोड",
  "Log out": "लॉग आउट",
  "Distribution Portal": "वितरण पोर्टल",
  "Bug Tracker": "बग ट्रैकर",

  // ── Bug notification bell ──
  "Bug notifications": "बग सूचनाएँ",
  "Bug reports": "बग रिपोर्ट",
  "Your reports": "आपकी रिपोर्ट",
  active: "सक्रिय",
  "No bug reports yet.": "अभी तक कोई बग रिपोर्ट नहीं।",
  "You haven't reported anything yet.": "आपने अभी तक कुछ रिपोर्ट नहीं किया।",
  "Open Bug Tracker": "बग ट्रैकर खोलें",
  // Bug statuses stay English on purpose — they mirror the admin Bug Tracker,
  // and "Open" already means the Beat action ("खोलें") in this English-as-key
  // dictionary, so a status entry would collide with it.

  // ── Live location pill (top bar) ──
  "Sharing location": "लोकेशन साझा हो रही है",
  "Connecting…": "कनेक्ट हो रहा है…",
  "Location blocked": "लोकेशन अवरुद्ध",
  "Location unavailable": "लोकेशन उपलब्ध नहीं",
  "Your Sales Officer can see you on the map while your day is open.":
    "जब तक आपका दिन खुला है, आपके सेल्स ऑफिसर आपको मैप पर देख सकते हैं।",
  "Allow location access so your Sales Officer can see your position.":
    "लोकेशन एक्सेस दें ताकि आपके सेल्स ऑफिसर आपकी स्थिति देख सकें।",

  // ── Report a Bug ──
  "Report a Bug": "समस्या दर्ज करें",
  "Tell us what went wrong — it goes straight to the admin's Bug Tracker.":
    "बताइए क्या गलत हुआ — यह सीधे एडमिन के बग ट्रैकर में जाएगा।",
  "Your report went straight to the admin's Bug Tracker.":
    "आपकी रिपोर्ट सीधे एडमिन के बग ट्रैकर में चली गई।",
  "Thanks!": "धन्यवाद!",
  Type: "प्रकार",
  Bug: "बग",
  Feature: "सुझाव",
  Title: "शीर्षक",
  "Short summary of the issue": "समस्या का संक्षिप्त विवरण",
  "What happened?": "क्या हुआ?",
  "Steps to reproduce, what you expected, what actually happened…":
    "कैसे दोहराएँ, आपने क्या अपेक्षा की, वास्तव में क्या हुआ…",
  Severity: "गंभीरता",
  Low: "कम",
  Medium: "मध्यम",
  High: "अधिक",
  Critical: "गंभीर",
  "Page / where": "पेज / कहाँ",
  "Screenshot (optional)": "स्क्रीनशॉट (वैकल्पिक)",
  "Attach a screenshot": "स्क्रीनशॉट अटैच करें",
  "— or paste one (Ctrl/⌘+V)": "— या एक पेस्ट करें (Ctrl/⌘+V)",
  "Screenshot attached": "स्क्रीनशॉट जोड़ा गया",
  Remove: "हटाएँ",
  Cancel: "रद्द करें",
  "Submit Bug": "बग भेजें",
  "Submit Feature": "सुझाव भेजें",
  "Give it a short title.": "एक संक्षिप्त शीर्षक दें।",
  "That image is too large — keep it under about 1 MB.":
    "यह छवि बहुत बड़ी है — इसे लगभग 1 MB से कम रखें।",
  Done: "हो गया",
  Close: "बंद करें",

  // ── Field: Beat ──
  Namaste: "नमस्ते",
  "Today's Beat": "आज का बीट",
  "Visits today": "आज विज़िट",
  "New counters": "नई दुकानें",
  "Check in": "चेक इन",
  Open: "खोलें",
  Visited: "विज़िट किया",
  remaining: "बाकी",
  "Find a counter by mobile number": "मोबाइल नंबर से दुकान खोजें",
  Search: "खोजें",
  "Searching…": "खोज रहे हैं…",
  View: "देखें",
  "No counters assigned for today yet — your Sales Officer (SO) sets your daily beat.":
    "आज के लिए अभी कोई दुकान असाइन नहीं — आपका सेल्स ऑफिसर (SO) आपका दैनिक बीट तय करता है।",

  // ── Field: Day Log ──
  "Good morning": "सुप्रभात",
  "Good afternoon": "नमस्कार",
  "Good evening": "शुभ संध्या",
  "Let's track your day and make it count.": "अपने दिन को ट्रैक करें और उसे सार्थक बनाएँ।",
  "Today's Plan": "आज की योजना",
  "Log your visit timings for today": "आज के अपने विज़िट समय दर्ज करें",
  "Visit Start Time": "विज़िट प्रारंभ समय",
  "Visit End Time": "विज़िट समाप्ति समय",
  Start: "प्रारंभ",
  End: "समाप्त",
  "Day complete": "दिन पूरा",
  "Every visit counts!": "हर विज़िट मायने रखती है!",
  "Keep logging your visits and achieve more everyday.": "अपनी विज़िट दर्ज करते रहें और हर दिन अधिक हासिल करें।",
  "Previous Days": "पिछले दिन",
  "Your recent visit history": "आपका हाल का विज़िट इतिहास",
  "No previous day logs yet.": "अभी तक कोई पिछला लॉग नहीं।",
  Date: "तारीख",
  "Start time": "प्रारंभ समय",
  "End time": "समाप्ति समय",
  "On job": "काम पर",
  "Keep up the great work!": "बढ़िया काम जारी रखें!",
  "Consistency today leads to success tomorrow.": "आज की निरंतरता कल की सफलता है।",

  // ── Mobile nav + theme ──
  More: "और",
  "Close menu": "मेन्यू बंद करें",
  "Dark mode": "डार्क मोड",
  "Change Password": "पासवर्ड बदलें",
  "Sign out": "साइन आउट",

  // ── Day Log ──
  "View all": "सभी देखें",
  "Show less": "कम दिखाएं",
  "Days Logged": "दर्ज दिन",
  "Total On Job": "कुल कार्य समय",
  "This Week": "इस सप्ताह",

  // ── Live maps: scope pickers (field/supervisor/hq) ──
  "All Areas": "सभी क्षेत्र",
  "All Depots": "सभी डिपो",
  "All C&F": "सभी C&F",
  "C&F HQ": "C&F मुख्यालय",
  Area: "क्षेत्र",
  "All depots": "सभी डिपो",
  "All areas": "सभी क्षेत्र",

  // ── Live maps: access notices ──
  "You don't have Field Salesman ISR access.": "आपके पास फील्ड सेल्समैन ISR एक्सेस नहीं है।",
  "You don't have Sales Officer access.": "आपके पास सेल्स ऑफिसर एक्सेस नहीं है।",
  "You don't have C&F HQ access.": "आपके पास C&F मुख्यालय एक्सेस नहीं है।",
  "You aren't mapped to a C&F yet — ask Central Admin.":
    "आप अभी तक किसी C&F से मैप नहीं हैं — सेंट्रल एडमिन से पूछें।",
  "No field reps report to you yet.": "अभी तक कोई फील्ड रेप आपको रिपोर्ट नहीं करता।",
  "No field reps report to you in this depot yet.":
    "इस डिपो में अभी तक कोई फील्ड रेप आपको रिपोर्ट नहीं करता।",
  "has no field reps yet.": "में अभी तक कोई फील्ड रेप नहीं है।",

  // ── Live maps: Sales Officer / C&F HQ team view ──
  "counter map": "काउंटर मैप",
  "Pending — assigned today": "लंबित — आज असाइन किया गया",
  "Rep (live)": "रेप (लाइव)",
  "Team today": "आज की टीम",
  "Live team — status for the day": "लाइव टीम — आज की स्थिति",
  Salesman: "सेल्समैन",
  Status: "स्थिति",
  Visits: "विज़िट",
  "Last seen": "आखिरी बार देखा गया",
  "Counter hrs": "काउंटर घंटे",
  visits: "विज़िट",
  "Day closed": "दिन बंद",
  "On counter": "काउंटर पर",
  Idle: "निष्क्रिय",
  "Not started": "शुरू नहीं हुआ",

  // ── Live maps: counter pins + popup (shared field/supervisor/hq) ──
  "Visited today": "आज विज़िट किया गया",
  Pending: "लंबित",
  Counter: "दुकान",
  "Last visit": "आखिरी विज़िट",

  // ── Live maps: live rep marker panel ──
  Live: "लाइव",
  Offline: "ऑफ़लाइन",
  of: "में से",
  "rep reporting now": "रेप अभी रिपोर्ट कर रहा है",
  "reps reporting now": "रेप अभी रिपोर्ट कर रहे हैं",
  "Rep markers update in realtime over WebSocket while they're clocked in.":
    "जब तक वे क्लॉक-इन हैं, रेप मार्कर वास्तविक समय में अपडेट होते हैं।",
  "Markers grey out after": "मार्कर धूसर हो जाते हैं",
  "minutes without an update.": "मिनट बिना अपडेट के बाद।",

  // ── Live maps: ISR (field) view ──
  "Finding your location…": "आपका स्थान खोजा जा रहा है…",
  "Location blocked — allow access to see how far each counter is.":
    "लोकेशन अवरुद्ध — प्रत्येक दुकान कितनी दूर है यह देखने के लिए एक्सेस दें।",
  "Location unavailable on this device.": "इस डिवाइस पर लोकेशन उपलब्ध नहीं है।",
  You: "आप",
  "counters map": "काउंटर मैप",
  "No beat today — your Sales Officer hasn't assigned any counters yet.":
    "आज कोई बीट नहीं — आपके सेल्स ऑफिसर ने अभी तक कोई दुकान असाइन नहीं की है।",
  "Distances are straight-line from your current location, not road distance.":
    "दूरियाँ आपके वर्तमान स्थान से सीधी रेखा में हैं, सड़क की दूरी नहीं।",
  "counter without GPS not shown.": "GPS के बिना दुकान नहीं दिखाई गई।",
  "counters without GPS not shown.": "GPS के बिना दुकानें नहीं दिखाई गईं।",
};

export function translate(lang: Lang, key: string): string {
  if (lang === "en") return key;
  return HI[key] ?? key;
}
