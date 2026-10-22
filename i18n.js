/* ==========================================================
   MindLens — language pack (English default + Tamil)
   Static UI strings are swapped via data-i18n / data-i18n-placeholder
   attributes. A handful of JS-driven interactive labels (button and
   status text) are translated too, via the exported t() helper, so
   they stay in sync when the language is switched mid-session.
   Analysis-result sentences (the verdict text produced after each
   check-in) are not yet translated — see README "Extending this".
   ========================================================== */
const MINDLENS_TRANSLATIONS = {
  en: {
    brand_sub: "an ML-powered reflection of your wellbeing",
    nav_assess: "Assess",
    nav_dashboard: "Dashboard",
    nav_resources: "Resources",
    nav_locations: "Find support",
    nav_contribute: "Contribute",
    lang_toggle: "தமிழ்",

    hero_eyebrow: "A gentle, multimodal wellness screener",
    hero_h1_line1: "Notice the weather",
    hero_h1_accent: "inside your mind.",
    hero_copy:
      "MindLens uses machine learning and deep learning models to look at what you write, how you sound, and how you look — and reflects back a gentle, early indicator of depression risk. It is a first flicker of light in the dark, not a diagnosis.",
    cta: "Begin a check-in →",
    hero_disclaimer:
      "Not a medical device. If you are in crisis, scroll to Resources or call KIRAN 1800-599-0019.",

    assess_eyebrow: "Three modalities",
    assess_title: "Share as many as you're comfortable with",

    plate_text_title: "Words",
    plate_text_help:
      "Write freely about how the last two weeks have felt. There's no right length. This is analysed with a deep-learning sentence-embedding model.",
    text_placeholder: "Start typing here...",
    analyze_text_btn: "Analyse my words",
    status_not_started: "Not started",

    plate_audio_title: "Voice",
    plate_audio_help:
      'Record 15–20 seconds describing your day, in your natural voice and pace, in English. MindLens listens to what you say (e.g. "today I am very happy") using speech recognition, and scores the meaning of your words — the same understanding used for the text check-in — with acoustic tone as a backup signal if speech isn\'t picked up clearly.',
    record_start: "Start recording",
    record_stop: "Stop recording",
    status_recording: "Recording",
    status_done: "Done",

    plate_video_title: "Face & Eyes",
    plate_video_help:
      "Take a photo with your camera, or upload one from your device. A deep convolutional network reads your facial expression from that single image — processed only in your browser.",
    video_start: "Take a photo",
    video_capture: "Capture photo",
    video_retake: "Take another photo",
    video_upload: "Upload a photo",
    video_live: "Analyse live",
    video_live_stop: "Stop live analysis",
    analyze_image_btn: "Analyse photo",
    analyzing_image_btn: "Analysing…",
    video_overlay_note: "Frame your face in the box and keep eyes visible.",
    video_focus_frame_label: "Align your eyes and face within the box.",
    video_tip:
      "Aim for good lighting and keep your face centered in the frame.",
    video_success_note:
      "Nice! Your photo has been analysed. Scroll up to review your updated dashboard.",
    video_permission_note:
      "Allow camera access when prompted if you take a photo. Uploaded photos are analysed only in your browser and are never sent anywhere.",
    status_camera_ready: "Camera ready",
    status_analyzing: "Analysing photo",

    dashboard_eyebrow: "The combined reading",
    dashboard_title: "Your combined reflection",
    gauge_placeholder: "Add a check-in above",
    bar_words: "Words",
    bar_voice: "Voice",
    bar_face: "Face",
    dashboard_note:
      "This score reflects surface patterns in language, tone and expression, estimated with machine-learning models — it cannot see your full context and is not a clinical assessment. A qualified counsellor can.",

    resources_eyebrow: "Someone to talk to",
    resources_title: "Free, confidential support across India",
    nearby_support_locations: "View nearby support locations",
    locations_eyebrow: "Find help nearby",
    locations_title: "Support locations on Google Maps",
    locations_intro:
      "Explore nearby counseling centers and psychiatrists. Google Maps may use your location to show relevant results. You can also open each search directly in Google Maps.",
    use_my_location: "Use my location",
    location_prompt:
      "Choose this button to find support near you. Your location is shared with Google Maps only after you allow access.",
    location_loading: "Finding your location…",
    location_success: "Maps are now showing support options near your location.",
    location_denied:
      "Location access was denied. Allow location access for this site in your browser settings, then try again.",
    location_unavailable:
      "Your location could not be determined. Check your device location settings and try again.",
    location_timeout:
      "Location request timed out. Check your connection and try again.",
    location_unsupported:
      "This browser does not support location access.",
    location_secure_context:
      "Location access requires HTTPS or a local address such as localhost.",
    counseling_locations_title: "Counseling centers",
    open_counseling_maps: "Open counseling centers in Google Maps",
    psychiatrist_locations_title: "Psychiatrists",
    open_psychiatrist_maps: "Open psychiatrists in Google Maps",
    kiran_desc: "Govt. of India mental health helpline, 24/7, 13 languages",
    vandrevala_desc: "24/7 crisis counselling",
    icall_desc: "Mon–Sat, 10am–8pm counselling",
    aasra_desc: "24/7 helpline for those in distress",

    footer_note:
      "MindLens is an academic screening prototype. It offers no diagnosis and stores no data outside your browser session.",

    crisis_strong: "You matter, and help is close by.",
    crisis_text:
      "If you're struggling right now, please reach out — these lines are free and confidential.",
  },
  ta: {
    brand_sub: "உங்கள் நல்வாழ்வின் இயந்திரக் கற்றல் பிரதிபலிப்பு",
    nav_assess: "மதிப்பீடு",
    nav_dashboard: "டாஷ்போர்டு",
    nav_resources: "வளங்கள்",
    nav_locations: "ஆதரவைத் தேடுங்கள்",
    nav_contribute: "பங்களிக்கவும்",
    lang_toggle: "English",

    hero_eyebrow: "மென்மையான, பல்முக நல்வாழ்வு சோதனை",
    hero_h1_line1: "வானிலையை கவனியுங்கள்",
    hero_h1_accent: "உங்கள் மனதிற்குள்.",
    hero_copy:
      "நீங்கள் எழுதுவது, உங்கள் குரல் தொனி, மற்றும் உங்கள் முக பாவனைகளை மைண்ட்லென்ஸ் இயந்திரக் கற்றல் மற்றும் ஆழக் கற்றல் மாதிரிகள் மூலம் கவனித்து, மனச்சோர்வு அபாயத்தின் மென்மையான, ஆரம்பகால அறிகுறியைக் காட்டுகிறது. இது இருளில் ஒரு முதல் ஒளிச்சுடர் — நோய் கண்டறிதல் அல்ல.",
    cta: "ஒரு பரிசோதனையைத் தொடங்குங்கள் →",
    hero_disclaimer:
      "இது ஒரு மருத்துவ கருவி அல்ல. நீங்கள் நெருக்கடியில் இருந்தால், வளங்கள் பகுதிக்குச் செல்லவும் அல்லது KIRAN 1800-599-0019 ஐ அழைக்கவும்.",

    assess_eyebrow: "மூன்று வழிமுறைகள்",
    assess_title: "நீங்கள் வசதியாக இருக்கும் அளவுக்குப் பகிரவும்",

    plate_text_title: "சொற்கள்",
    plate_text_help:
      "கடந்த இரண்டு வாரங்கள் எப்படி இருந்தன என்பதை சுதந்திரமாக எழுதுங்கள். குறிப்பிட்ட நீளம் தேவையில்லை. இது ஆழக் கற்றல் வாக்கிய-உட்பொதிவு மாதிரி மூலம் பகுப்பாய்வு செய்யப்படுகிறது.",
    text_placeholder: "இங்கே தட்டச்சு செய்யத் தொடங்குங்கள்...",
    analyze_text_btn: "என் சொற்களை பகுப்பாய்வு செய்",
    status_not_started: "தொடங்கவில்லை",

    plate_audio_title: "குரல்",
    plate_audio_help:
      'உங்கள் இயல்பான குரலிலும் வேகத்திலும், ஆங்கிலத்தில், உங்கள் நாள் பற்றி 15–20 வினாடிகள் பதிவு செய்யுங்கள். MindLens பேச்சு அங்கீகாரம் (speech recognition) மூலம் நீங்கள் சொல்வதைப் புரிந்துகொண்டு (எ.கா. "today I am very happy") அதன் பொருளை மதிப்பிடுகிறது — உரை பரிசோதனையில் பயன்படுத்தப்படும் அதே புரிதல் — பேச்சு தெளிவாக கண்டறியப்படாவிட்டால் ஒலியியல் தொனி காப்பு சமிக்ஞையாக பயன்படுகிறது.',
    record_start: "பதிவை தொடங்கு",
    record_stop: "பதிவை நிறுத்து",
    status_recording: "பதிவு செய்கிறது",
    status_done: "முடிந்தது",

    plate_video_title: "முகம் & கண்கள்",
    plate_video_help:
      "உங்கள் கேமராவில் ஒரு புகைப்படம் எடுக்கவும், அல்லது உங்கள் சாதனத்திலிருந்து ஒன்றை பதிவேற்றவும். ஒரு ஆழமான கன்வல்யூஷனல் நரம்பியல் வலையமைப்பு அந்த ஒற்றைப் படத்திலிருந்து உங்கள் முக பாவனையைப் படிக்கிறது — உங்கள் உலாவியில் மட்டும்.",
    video_start: "புகைப்படம் எடு",
    video_capture: "படம் பிடி",
    video_retake: "மற்றொரு புகைப்படம் எடு",
    video_upload: "புகைப்படத்தை பதிவேற்று",
    video_live: "நேரலை பகுப்பாய்வு செய்",
    video_live_stop: "நேரலை பகுப்பாய்வை நிறுத்து",
    analyze_image_btn: "புகைப்படத்தை பகுப்பாய்வு செய்",
    analyzing_image_btn: "பகுப்பாய்வு செய்கிறது…",
    video_overlay_note:
      "உங்கள் முகத்தை பெட்டியில் சரியாக அமைக்கவும் மற்றும் கண்களை தெளிவாக வைத்திருங்கள்.",
    video_focus_frame_label:
      "உங்கள் கண்கள் மற்றும் முகத்தை பெட்டியில் சீராக ஒழுங்குபடுத்தவும்.",
    video_tip:
      "நல்ல ஒளியையும், உங்கள் முகத்தை கட்டமைக்கவும் மற்றும் அகலமாகப் பார்க்கவும்.",
    video_permission_note:
      "புகைப்படம் எடுத்தால் கேமரா அனுமதி கேட்கும்போது அதை அனுமதிக்கவும். பதிவேற்றிய புகைப்படங்கள் உங்கள் உலாவியில் மட்டுமே பகுப்பாய்வு செய்யப்படும், எங்கும் அனுப்பப்படாது.",
    status_camera_ready: "கேமரா தயார்",
    status_analyzing: "புகைப்படத்தை பகுப்பாய்வு செய்கிறது",

    dashboard_eyebrow: "இணைந்த முடிவு",
    dashboard_title: "உங்கள் இணைந்த பிரதிபலிப்பு",
    gauge_placeholder: "மேலே ஒரு பரிசோதனையைச் சேர்க்கவும்",
    bar_words: "சொற்கள்",
    bar_voice: "குரல்",
    bar_face: "முகம்",
    dashboard_note:
      "இந்த மதிப்பெண் மொழி, தொனி மற்றும் வெளிப்பாட்டின் மேற்பரப்பு அமைப்புகளை, இயந்திரக் கற்றல் மாதிரிகள் மூலம் மதிப்பிட்டு பிரதிபலிக்கிறது — இது உங்கள் முழு சூழலைப் பார்க்க முடியாது, இது மருத்துவ மதிப்பீடு அல்ல. ஒரு தகுதிவாய்ந்த ஆலோசகரால் மட்டுமே அது முடியும்.",

    resources_eyebrow: "பேச யாராவது",
    resources_title: "இந்தியா முழுவதும் இலவச, ரகசியமான ஆதரவு",
    nearby_support_locations: "அருகிலுள்ள ஆதரவு இடங்களைக் காண்க",
    locations_eyebrow: "அருகிலுள்ள உதவியைக் கண்டறியுங்கள்",
    locations_title: "Google Maps-இல் ஆதரவு மையங்கள்",
    locations_intro:
      "அருகிலுள்ள ஆலோசனை மையங்களையும் மனநல மருத்துவர்களையும் பாருங்கள். தொடர்புடைய முடிவுகளைக் காட்ட Google Maps உங்கள் இருப்பிடத்தைப் பயன்படுத்தலாம். ஒவ்வொரு தேடலையும் Google Maps-இல் நேரடியாகத் திறக்கலாம்.",
    use_my_location: "எனது இருப்பிடத்தைப் பயன்படுத்து",
    location_prompt:
      "உங்களுக்கு அருகிலுள்ள ஆதரவைத் தேட இந்த பொத்தானைத் தேர்ந்தெடுக்கவும். நீங்கள் அனுமதித்த பிறகே உங்கள் இருப்பிடம் Google Maps-உடன் பகிரப்படும்.",
    location_loading: "உங்கள் இருப்பிடத்தைக் கண்டறிகிறது…",
    location_success:
      "உங்கள் இருப்பிடத்திற்கு அருகிலுள்ள ஆதரவு விருப்பங்களை Maps இப்போது காட்டுகிறது.",
    location_denied:
      "இருப்பிட அணுகல் மறுக்கப்பட்டது. உலாவி அமைப்புகளில் இந்த தளத்திற்கான இருப்பிட அணுகலை அனுமதித்து மீண்டும் முயற்சிக்கவும்.",
    location_unavailable:
      "உங்கள் இருப்பிடத்தைக் கண்டறிய முடியவில்லை. சாதனத்தின் இருப்பிட அமைப்புகளைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    location_timeout:
      "இருப்பிடக் கோரிக்கைக்கான நேரம் முடிந்தது. இணைய இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
    location_unsupported: "இந்த உலாவி இருப்பிட அணுகலை ஆதரிக்கவில்லை.",
    location_secure_context:
      "இருப்பிட அணுகலுக்கு HTTPS அல்லது localhost போன்ற உள்ளூர் முகவரி தேவை.",
    counseling_locations_title: "ஆலோசனை மையங்கள்",
    open_counseling_maps: "Google Maps-இல் ஆலோசனை மையங்களைக் காண்க",
    psychiatrist_locations_title: "மனநல மருத்துவர்கள்",
    open_psychiatrist_maps: "Google Maps-இல் மனநல மருத்துவர்களைக் காண்க",
    kiran_desc: "இந்திய அரசு மனநல உதவி எண், 24/7, 13 மொழிகளில்",
    vandrevala_desc: "24/7 நெருக்கடி ஆலோசனை",
    icall_desc: "திங்கள்–சனி, காலை 10 - இரவு 8 ஆலோசனை",
    aasra_desc: "மன உளைச்சலில் இருப்பவர்களுக்கான 24/7 உதவி எண்",

    footer_note:
      "மைண்ட்லென்ஸ் ஒரு கல்வி சோதனை மாதிரி ஆகும். இது நோய் கண்டறிதல் எதுவும் வழங்காது, மேலும் உங்கள் உலாவி அமர்வுக்கு வெளியே எந்த தரவையும் சேமிக்காது.",

    crisis_strong: "நீங்கள் முக்கியமானவர், உதவி அருகிலேயே உள்ளது.",
    crisis_text:
      "நீங்கள் இப்போது சிரமப்படுகிறீர்கள் என்றால், தயவுசெய்து தொடர்பு கொள்ளுங்கள் — இந்த எண்கள் இலவசம் மற்றும் ரகசியமானவை.",
  },
};

let mindlensLang = "en";

function t(key) {
  return (
    (MINDLENS_TRANSLATIONS[mindlensLang] &&
      MINDLENS_TRANSLATIONS[mindlensLang][key]) ||
    MINDLENS_TRANSLATIONS.en[key] ||
    key
  );
}

function applyLanguage(lang) {
  if (!MINDLENS_TRANSLATIONS[lang]) lang = "en";
  mindlensLang = lang;
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const val = t(key);
    if (val) el.textContent = val;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const val = t(key);
    if (val) el.placeholder = val;
  });

  const toggle = document.getElementById("langToggle");
  if (toggle) toggle.textContent = t("lang_toggle");

  try {
    localStorage.setItem("mindlens-lang", lang);
  } catch (e) {
    /* private browsing, etc. */
  }

  // Let script.js refresh any live button/status labels that reflect
  // current interaction state (idle vs recording vs done), since those
  // are set imperatively rather than via data-i18n.
  document.dispatchEvent(
    new CustomEvent("mindlens-language-changed", { detail: { lang } }),
  );
}

document.addEventListener("DOMContentLoaded", () => {
  let saved = "en";
  try {
    saved = localStorage.getItem("mindlens-lang") || "en";
  } catch (e) {
    /* ignore */
  }
  applyLanguage(saved);

  const toggle = document.getElementById("langToggle");
  if (toggle) {
    toggle.addEventListener("click", () => {
      applyLanguage(mindlensLang === "en" ? "ta" : "en");
    });
  }
});
