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
  "Field Salesman": "फील्ड सेल्समैन",
  Supervisor: "सुपरवाइज़र",
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
  "No counters assigned for today yet — your supervisor (SO) sets your daily beat.":
    "आज के लिए अभी कोई दुकान असाइन नहीं — आपका सुपरवाइज़र (SO) आपका दैनिक बीट तय करता है।",

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
};

export function translate(lang: Lang, key: string): string {
  if (lang === "en") return key;
  return HI[key] ?? key;
}
