/* Smaran weekly check-in engine
   Branched, contradiction-aware question flow for cardiometabolic (CKM) health,
   focused on diabetes. Pure functions only: no DOM, no storage. Works in the
   browser (window.SmaranCheckin) and in Node (module.exports) for tests.

   This is a self-check and reminder tool. It never diagnoses. Every output is
   phrased as "what to check and when", with a doctor confirming anything.

   Sources used for thresholds and intervals:
   - ADA Standards of Care: HbA1c / fasting glucose bands, HbA1c every 3 months
     when not at goal and 6 months when at goal, yearly kidney (UACR + eGFR),
     eye and lipid checks for people with diabetes.
   - Indian Diabetes Risk Score (Mohan et al., JAPI 2005): age, waist,
     activity and family history; score of 60+ is high risk.
   - NP-NCD (Govt of India): population screening for sugar and BP from age 30.
   - IDPP-1 (Ramachandran et al., Diabetologia 2006): lifestyle change lowered
     progression from prediabetes to diabetes by about 28%.
   - UKPDS 35: each 1% fall in HbA1c linked to about 21% fewer
     diabetes-related deaths.
   - ICMR-INDIAB (Lancet D&E 2023): 11.4% diabetes, 15.3% prediabetes. */

(function (root) {
  'use strict';

  const MAX_Q = 10;
  const DAY = 864e5;
  const T = (en, bn) => ({ en, bn });

  const TOLD = ['diabetes', 'borderline', 'normal', 'unsure'];
  const CLASSIC = ['urination', 'thirst', 'weightloss', 'vision'];
  const has = (arr, v) => Array.isArray(arr) && arr.includes(v);
  const any = (arr, list) => Array.isArray(arr) && arr.some(v => list.includes(v));
  const count = (arr, list) => (Array.isArray(arr) ? arr.filter(v => list.includes(v)).length : 0);

  /* Approx months since last test, by answer bucket */
  const LAST_TEST_MONTHS = { lt3m: 1.5, m3_12: 7.5, y1_3: 24, gt3y: 48, never: null };

  /* ------------------------------------------------------------------ */
  /* Questions                                                          */
  /* Each question: id, emoji, text, help?, type, options, ask(s),      */
  /* tip(value, s) for the 1-line info shown after a selection,         */
  /* effect(s, value) for inferred answers.                             */
  /* ------------------------------------------------------------------ */

  const Q = {};

  Q.followup = {
    id: 'followup', emoji: '🔁', type: 'single',
    text: s => {
      const item = followupItem(s);
      const d = item ? fmtDate(new Date(item.due), 'en') : '';
      const dbn = item ? fmtDate(new Date(item.due), 'bn') : '';
      return T(
        `Last time we suggested a sugar test by ${d}. Did you get it done?`,
        `গতবার আমরা ${dbn}-এর মধ্যে একটি সুগার টেস্টের কথা বলেছিলাম। করিয়েছেন কি?`
      );
    },
    options: [
      { v: 'done', e: '✅', l: T('Yes, done!', 'হ্যাঁ, করিয়েছি!') },
      { v: 'booked', e: '📅', l: T('Booked, not done yet', 'বুক করেছি, এখনও হয়নি') },
      { v: 'notime', e: '⏳', l: T('Not yet, no time', 'এখনও না, সময় পাইনি') },
      { v: 'cost', e: '💸', l: T('Not yet, felt too costly', 'এখনও না, খরচ বেশি মনে হয়েছে') },
      { v: 'fine', e: '🙂', l: T('Felt fine, so skipped it', 'ভালো ছিলাম, তাই করাইনি') }
    ],
    ask: s => !!followupItem(s),
    effect: (s, v) => {
      if (v === 'done') { s.a.lastTest = 'lt3m'; s.inferred.lastTest = true; s.flags.testDone = true; }
    },
    tip: v => ({
      done: T('Great work! You earn +100 bonus points for completing your test 🎉',
        'দারুণ! টেস্ট করানোর জন্য আপনি +১০০ বোনাস পয়েন্ট পেলেন 🎉'),
      booked: T('Nice. Fast for 8 to 10 hours before a fasting sugar test (water is fine).',
        'ভালো। ফাস্টিং সুগার টেস্টের আগে ৮ থেকে ১০ ঘণ্টা কিছু খাবেন না (জল খাওয়া যাবে)।'),
      notime: T('Many labs collect blood at home early in the morning, before work.',
        'অনেক ল্যাব সকালে কাজে বেরোনোর আগেই বাড়ি এসে রক্ত নিয়ে যায়।'),
      cost: T('Government Ayushman Arogya Mandir centres screen adults 30+ for sugar and BP for free.',
        'সরকারি আয়ুষ্মান আরোগ্য মন্দিরে ৩০ বছরের বেশি বয়সীদের সুগার ও প্রেসার বিনামূল্যে পরীক্ষা হয়।'),
      fine: T('High sugar usually causes no symptoms for years. A test catches what feelings miss.',
        'বেশি সুগার বছরের পর বছর কোনো লক্ষণ ছাড়াই থাকতে পারে। টেস্টে যা ধরা পড়ে, অনুভূতিতে তা পড়ে না।')
    })[v]
  };

  Q.status = {
    id: 'status', emoji: '🩸', type: 'single',
    text: T('Has a doctor or health worker ever told you anything about your blood sugar?',
      'কোনো ডাক্তার বা স্বাস্থ্যকর্মী কি কখনো আপনার রক্তে শর্করা (সুগার) নিয়ে কিছু বলেছেন?'),
    options: [
      { v: 'diabetes', e: '🩺', l: T('Yes, I have diabetes (sugar)', 'হ্যাঁ, আমার ডায়াবেটিস (সুগার) আছে') },
      { v: 'borderline', e: '⚠️', l: T('Told it is borderline / pre-diabetes', 'বলেছেন বর্ডারলাইন / প্রি-ডায়াবেটিস') },
      { v: 'normal', e: '✅', l: T('Told it is normal', 'বলেছেন স্বাভাবিক') },
      { v: 'never', e: '🤷', l: T('I have never had a sugar test', 'কখনো সুগার টেস্ট করাইনি') },
      { v: 'unsure', e: '❓', l: T('Tested, but not sure what they said', 'টেস্ট করিয়েছি, কিন্তু কী বলেছিল মনে নেই') }
    ],
    ask: () => true,
    effect: (s, v) => {
      if (v === 'never' && !('lastTest' in s.a)) { s.a.lastTest = 'never'; s.inferred.lastTest = true; }
    },
    tip: v => ({
      diabetes: T('Regular checks, not just medicines, are what protect your eyes, kidneys and heart.',
        'শুধু ওষুধ নয়, নিয়মিত পরীক্ষাই আপনার চোখ, কিডনি আর হার্টকে রক্ষা করে।'),
      borderline: T('Borderline is the best time to act: in an Indian study, lifestyle change cut the chance of diabetes by about 28%.',
        'বর্ডারলাইনই পদক্ষেপ নেওয়ার সেরা সময়: ভারতের এক গবেষণায় জীবনযাত্রা বদলে ডায়াবেটিসের সম্ভাবনা প্রায় ২৮% কমেছিল।'),
      normal: T('Good to hear. Sugar can change quietly with age, so keep up the routine checks.',
        'শুনে ভালো লাগল। বয়সের সঙ্গে সুগার চুপিচুপি বাড়তে পারে, তাই নিয়মিত পরীক্ষা চালিয়ে যান।'),
      never: T('Free sugar and BP checks for adults 30+ are offered at government Ayushman Arogya Mandir centres.',
        'সরকারি আয়ুষ্মান আরোগ্য মন্দিরে ৩০ বছরের বেশি বয়সীদের বিনামূল্যে সুগার ও প্রেসার পরীক্ষা হয়।'),
      unsure: T('Next time, ask for a printed report or take a photo of it. Your numbers are yours to keep.',
        'পরের বার রিপোর্টের প্রিন্ট চেয়ে নিন বা ছবি তুলে রাখুন। আপনার রিপোর্ট আপনারই কাছে থাকা উচিত।')
    })[v]
  };

  Q.age = {
    id: 'age', emoji: '🎂', type: 'single',
    text: T('How old are you?', 'আপনার বয়স কত?'),
    options: [
      { v: 'u35', e: '🧑', l: T('Under 35', '৩৫-এর কম') },
      { v: 'a35', e: '🧔', l: T('35 to 49', '৩৫ থেকে ৪৯') },
      { v: 'a50', e: '👨‍🦳', l: T('50 to 64', '৫০ থেকে ৬৪') },
      { v: 'a65', e: '👴', l: T('65 or older', '৬৫ বা তার বেশি') }
    ],
    ask: s => !(s.prev && s.prev.a && s.prev.a.age),
    tip: v => v === 'u35'
      ? T('Indians tend to get diabetes younger than people in the West, so checks are advised from age 30.',
        'পশ্চিমের তুলনায় ভারতীয়দের কম বয়সে ডায়াবেটিস হয়, তাই ৩০ বছর বয়স থেকেই পরীক্ষা করানো ভালো।')
      : T('From 30 onwards, a yearly sugar and BP check is a good habit for every Indian adult.',
        '৩০ বছরের পর থেকে প্রতি বছর সুগার আর প্রেসার মাপানো প্রত্যেক ভারতীয়ের জন্য ভালো অভ্যাস।')
  };

  Q.symptoms = {
    id: 'symptoms', emoji: '🔎', type: 'multi', exclusive: 'none',
    text: T('In the last few weeks, have you noticed any of these?',
      'গত কয়েক সপ্তাহে এগুলোর কোনোটা লক্ষ করেছেন কি?'),
    help: T('Pick all that apply.', 'যতগুলো মেলে, সব বেছে নিন।'),
    options: [
      { v: 'urination', e: '🚻', l: T('Peeing more often, even at night', 'ঘন ঘন প্রস্রাব, রাতেও') },
      { v: 'thirst', e: '💧', l: T('Very thirsty or dry mouth', 'খুব তেষ্টা বা মুখ শুকিয়ে যাওয়া') },
      { v: 'weightloss', e: '⚖️', l: T('Losing weight without trying', 'চেষ্টা ছাড়াই ওজন কমে যাওয়া') },
      { v: 'tired', e: '😴', l: T('Tired all the time', 'সবসময় ক্লান্ত লাগা') },
      { v: 'wounds', e: '🩹', l: T('Cuts or sores healing slowly', 'কাটা বা ঘা দেরিতে শুকোচ্ছে') },
      { v: 'vision', e: '👓', l: T('Blurry vision', 'ঝাপসা দেখা') },
      { v: 'tingling', e: '🦶', l: T('Tingling or numb feet', 'পায়ে ঝিনঝিন বা অবশ ভাব') },
      { v: 'swelling', e: '🦵', l: T('Swelling in feet or face', 'পায়ে বা মুখে ফোলা') },
      { v: 'breath', e: '😮‍💨', l: T('Breathless on climbing stairs', 'সিঁড়ি উঠতে হাঁপিয়ে যাওয়া') },
      { v: 'none', e: '🙂', l: T('None of these', 'এগুলোর কোনোটাই নয়') }
    ],
    ask: () => true,
    tip: v => {
      if (has(v, 'none')) return T('Good. Still, high sugar is often silent, so tests matter more than symptoms.',
        'ভালো। তবে বেশি সুগার প্রায়ই চুপচাপ থাকে, তাই লক্ষণের চেয়ে পরীক্ষা বেশি জরুরি।');
      if (count(v, CLASSIC) >= 2) return T('Thirst, frequent peeing and weight loss together are worth a sugar test soon.',
        'তেষ্টা, ঘন ঘন প্রস্রাব আর ওজন কমা একসঙ্গে হলে শিগগিরই সুগার টেস্ট করানো উচিত।');
      if (has(v, 'tingling')) return T('Check your feet every day for cuts or colour change; tingling is worth showing a doctor.',
        'রোজ পায়ে কাটা বা রং বদল দেখুন; ঝিনঝিন ভাব হলে ডাক্তারকে দেখানো ভালো।');
      if (has(v, 'swelling')) return T('Swelling can relate to kidneys or heart; a simple urine test can check the kidneys.',
        'ফোলা কিডনি বা হার্টের সঙ্গে যুক্ত হতে পারে; একটা সাধারণ ইউরিন টেস্টে কিডনি দেখা যায়।');
      if (has(v, 'breath')) return T('New breathlessness on stairs is worth a BP and heart check with your doctor.',
        'সিঁড়িতে নতুন করে হাঁপ ধরলে ডাক্তারের কাছে প্রেসার আর হার্ট পরীক্ষা করানো ভালো।');
      return T('Thanks. These help us suggest the right test timing for you.',
        'ধন্যবাদ। এগুলো আপনার জন্য সঠিক সময়ে পরীক্ষার পরামর্শ দিতে সাহায্য করবে।');
    }
  };

  Q.redflag = {
    id: 'redflag', emoji: '🚑', type: 'multi', exclusive: 'none',
    text: T('Right now, are you having any of these?', 'এই মুহূর্তে এগুলোর কোনোটা হচ্ছে কি?'),
    options: [
      { v: 'vomiting', e: '🤢', l: T('Vomiting or bad stomach pain', 'বমি বা পেটে তীব্র ব্যথা') },
      { v: 'confused', e: '😵', l: T('Confusion or very drowsy', 'বিভ্রান্ত লাগা বা খুব ঘুম ঘুম ভাব') },
      { v: 'chest', e: '💔', l: T('Chest pain or pressure', 'বুকে ব্যথা বা চাপ') },
      { v: 'rest_breath', e: '🫁', l: T('Hard to breathe even at rest', 'বিশ্রামেও শ্বাস নিতে কষ্ট') },
      { v: 'none', e: '👍', l: T('None right now', 'এখন কোনোটাই নয়') }
    ],
    ask: s => s.a.value === 'veryhigh' || count(s.a.symptoms, CLASSIC) >= 3 ||
      (has(s.a.symptoms, 'breath') && has(s.a.symptoms, 'swelling')),
    tip: v => has(v, 'none') || !v.length
      ? T('Good. If any of these ever start, go to a hospital the same day.',
        'ভালো। কখনো এগুলোর কোনোটা শুরু হলে সেদিনই হাসপাতালে যান।')
      : T('Please go to a hospital today or call 108. Do not wait for this check-in to finish.',
        'দয়া করে আজই হাসপাতালে যান বা ১০৮-এ ফোন করুন। এই চেক-ইন শেষ হওয়ার অপেক্ষা করবেন না।')
  };

  Q.lastTest = {
    id: 'lastTest', emoji: '🗓️', type: 'single',
    text: s => s.a.status === 'diabetes'
      ? T('When was your last HbA1c or fasting sugar test?', 'শেষ কবে HbA1c বা ফাস্টিং সুগার টেস্ট করিয়েছেন?')
      : T('When was your last blood sugar test?', 'শেষ কবে রক্তের সুগার টেস্ট করিয়েছেন?'),
    options: [
      { v: 'lt3m', e: '🟢', l: T('In the last 3 months', 'গত ৩ মাসের মধ্যে') },
      { v: 'm3_12', e: '🟡', l: T('3 to 12 months ago', '৩ থেকে ১২ মাস আগে') },
      { v: 'y1_3', e: '🟠', l: T('1 to 3 years ago', '১ থেকে ৩ বছর আগে') },
      { v: 'gt3y', e: '🔴', l: T('More than 3 years ago', '৩ বছরেরও বেশি আগে') },
      { v: 'never', e: '⚪', l: T('Never', 'কখনো না') }
    ],
    ask: s => s.a.status !== 'never',
    tip: (v, s) => {
      if (s.a.status === 'diabetes' && (v === 'y1_3' || v === 'gt3y'))
        return T('With diabetes, HbA1c is usually checked every 3 to 6 months.',
          'ডায়াবেটিস থাকলে সাধারণত প্রতি ৩ থেকে ৬ মাসে HbA1c পরীক্ষা করা হয়।');
      if (v === 'gt3y' || v === 'y1_3')
        return T('It has been a while. Sugar levels can change quietly, so a fresh test helps.',
          'অনেকদিন হয়ে গেছে। সুগার চুপিচুপি বদলাতে পারে, তাই নতুন করে টেস্ট করানো ভালো।');
      return null;
    }
  };

  Q.value = {
    id: 'value', emoji: '📋', type: 'single',
    text: T('Roughly what did that report show?', 'সেই রিপোর্টে মোটামুটি কত এসেছিল?'),
    help: T('Fasting sugar is tested before breakfast (mg/dL). HbA1c shows your 3-month average (%).',
      'ফাস্টিং সুগার জলখাবারের আগে মাপা হয় (mg/dL)। HbA1c দেখায় ৩ মাসের গড় (%)।'),
    options: [
      { v: 'normal', e: '🟢', l: T('Fasting below 100, or HbA1c below 5.7%', 'ফাস্টিং ১০০-র নিচে, বা HbA1c ৫.৭%-এর নিচে') },
      { v: 'pre', e: '🟡', l: T('Fasting 100 to 125, or HbA1c 5.7 to 6.4%', 'ফাস্টিং ১০০ থেকে ১২৫, বা HbA1c ৫.৭ থেকে ৬.৪%') },
      { v: 'dm', e: '🟠', l: T('Fasting 126 to 180, or HbA1c 6.5 to 7.9%', 'ফাস্টিং ১২৬ থেকে ১৮০, বা HbA1c ৬.৫ থেকে ৭.৯%') },
      { v: 'high', e: '🔴', l: T('Fasting 181 to 250, or HbA1c 8 to 10%', 'ফাস্টিং ১৮১ থেকে ২৫০, বা HbA1c ৮ থেকে ১০%') },
      { v: 'veryhigh', e: '🚨', l: T('Fasting above 250, HbA1c above 10%, or any reading above 300', 'ফাস্টিং ২৫০-এর বেশি, HbA1c ১০%-এর বেশি, বা কোনো রিডিং ৩০০-র বেশি') },
      { v: 'unknown', e: '🤔', l: T("I don't remember", 'মনে নেই') }
    ],
    ask: s => s.a.lastTest && s.a.lastTest !== 'never',
    tip: (v, s) => {
      const dmk = s.a.status === 'diabetes';
      return ({
        normal: dmk ? T('In range: that is what good control looks like. Keep the routine going.',
          'লক্ষ্যের মধ্যে: ভালো নিয়ন্ত্রণ মানে এটাই। এভাবেই চালিয়ে যান।')
          : T('Normal range. A yearly check keeps it that way on record.',
            'স্বাভাবিক সীমায়। বছরে একবার পরীক্ষা করে রেকর্ড রাখুন।'),
        pre: T('This is the warning zone, and it is often reversible with daily walking and less refined carbs.',
          'এটা সতর্কতার সীমা, রোজ হাঁটা আর ময়দা-চিনি কমালে প্রায়ই ফিরিয়ে আনা যায়।'),
        dm: dmk ? T('For most people with diabetes, the HbA1c target is below 7%.',
          'বেশিরভাগ ডায়াবেটিস রোগীর জন্য HbA1c-এর লক্ষ্য ৭%-এর নিচে।')
          : T('A number in this range needs a doctor to confirm with a repeat test.',
            'এই সীমার সংখ্যা হলে ডাক্তারের কাছে আবার পরীক্ষা করে নিশ্চিত হওয়া দরকার।'),
        high: T('Each 1% drop in HbA1c has been linked to about 21% fewer diabetes-related deaths.',
          'HbA1c প্রতি ১% কমলে ডায়াবেটিসজনিত মৃত্যু প্রায় ২১% কমে বলে দেখা গেছে।'),
        veryhigh: T('Readings this high need a doctor soon, not just a routine visit.',
          'এত বেশি রিডিং হলে শুধু নিয়মিত ভিজিট নয়, শিগগিরই ডাক্তার দেখানো দরকার।'),
        unknown: T('Ask your lab for a WhatsApp copy of reports so you always have your numbers.',
          'ল্যাবকে রিপোর্টের একটা WhatsApp কপি পাঠাতে বলুন, তাহলে সংখ্যাগুলো সবসময় হাতে থাকবে।')
      })[v];
    }
  };

  Q.meds = {
    id: 'meds', emoji: '💊', type: 'single',
    text: T('How are you taking your sugar medicines?', 'সুগারের ওষুধ কীভাবে খাচ্ছেন?'),
    options: [
      { v: 'daily', e: '✅', l: T('Every day, as prescribed', 'প্রতিদিন, যেমন বলা আছে') },
      { v: 'miss', e: '😅', l: T('I sometimes forget', 'মাঝে মাঝে ভুলে যাই') },
      { v: 'stopped', e: '⛔', l: T('I have stopped them', 'বন্ধ করে দিয়েছি') },
      { v: 'insulin', e: '💉', l: T('On insulin (with or without tablets)', 'ইনসুলিন নিই (ট্যাবলেটসহ বা ছাড়া)') },
      { v: 'none', e: '🥗', l: T('No medicines, diet control only', 'ওষুধ নেই, শুধু খাবার নিয়ন্ত্রণ') }
    ],
    ask: s => s.a.status === 'diabetes',
    tip: v => ({
      daily: T('Well done. Steady medicines plus regular tests is the winning combination.',
        'খুব ভালো। নিয়মিত ওষুধ আর নিয়মিত পরীক্ষা, এটাই সেরা জুটি।'),
      miss: T('Keep tablets next to your toothbrush, or set a phone alarm. Small trick, big help.',
        'ট্যাবলেট টুথব্রাশের পাশে রাখুন বা ফোনে অ্যালার্ম দিন। ছোট কৌশল, বড় উপকার।'),
      stopped: T('Please do not stop sugar medicines without your doctor; sugar can rise silently.',
        'ডাক্তারের পরামর্শ ছাড়া সুগারের ওষুধ বন্ধ করবেন না; সুগার চুপিচুপি বেড়ে যেতে পারে।'),
      insulin: T('Keep insulin away from heat; in summer, a clay pot cooler works if you have no fridge.',
        'ইনসুলিন গরম থেকে দূরে রাখুন; ফ্রিজ না থাকলে গরমে মাটির কলসির ঠান্ডায় রাখা যায়।'),
      none: T('Diet control works for some; a regular HbA1c is how you know it is still working.',
        'অনেকের খাবার নিয়ন্ত্রণেই কাজ হয়; নিয়মিত HbA1c দিয়েই বোঝা যায় এখনও কাজ হচ্ছে কিনা।')
    })[v]
  };

  Q.lows = {
    id: 'lows', emoji: '🍬', type: 'single',
    text: T('In the past month, did you suddenly feel shaky, sweaty or very hungry?',
      'গত এক মাসে হঠাৎ কাঁপুনি, ঘাম বা খুব খিদে পেয়েছে কি?'),
    options: [
      { v: 'never', e: '👍', l: T('No', 'না') },
      { v: 'once', e: '☝️', l: T('Once or twice', 'এক-দুবার') },
      { v: 'often', e: '⚠️', l: T('Often', 'প্রায়ই') }
    ],
    ask: s => ['daily', 'miss', 'insulin'].includes(s.a.meds),
    tip: v => v === 'never' ? null
      : T('These can be signs of low sugar. Keep glucose or sugar handy and tell your doctor.',
        'এগুলো সুগার কমে যাওয়ার লক্ষণ হতে পারে। হাতের কাছে গ্লুকোজ বা চিনি রাখুন আর ডাক্তারকে জানান।')
  };

  Q.family = {
    id: 'family', emoji: '👨‍👩‍👧', type: 'single',
    text: T('Does anyone in your family have diabetes?', 'পরিবারে কারও ডায়াবেটিস আছে কি?'),
    options: [
      { v: 'none', e: '🙅', l: T('No one', 'কারও নেই') },
      { v: 'one', e: '👤', l: T('One parent', 'বাবা বা মা, একজনের') },
      { v: 'both', e: '👥', l: T('Both parents', 'বাবা-মা দুজনেরই') },
      { v: 'unsure', e: '❓', l: T('Not sure', 'জানি না') }
    ],
    ask: s => s.a.status !== 'diabetes' && !(s.prev && s.prev.a && s.prev.a.family),
    tip: v => v === 'one' || v === 'both'
      ? T('Family history raises your chances, but daily habits still decide a lot.',
        'পারিবারিক ইতিহাস সম্ভাবনা বাড়ায়, কিন্তু রোজকার অভ্যাস এখনও অনেক কিছু ঠিক করে।')
      : null
  };

  Q.waist = {
    id: 'waist', emoji: '📏', type: 'single',
    text: T('Around your belly at the navel (or your trouser size), which fits you?',
      'নাভির কাছে পেটের মাপ (বা প্যান্টের সাইজ), কোনটা আপনার সঙ্গে মেলে?'),
    options: [
      { v: 'small', e: '🟢', l: T('Women under 80 cm (31 in), men under 90 cm (35 in)', 'মহিলা ৮০ সেমি (৩১ ইঞ্চি)-র কম, পুরুষ ৯০ সেমি (৩৫ ইঞ্চি)-র কম') },
      { v: 'mid', e: '🟡', l: T('Women 80 to 89 cm, men 90 to 99 cm', 'মহিলা ৮০ থেকে ৮৯ সেমি, পুরুষ ৯০ থেকে ৯৯ সেমি') },
      { v: 'large', e: '🟠', l: T('Women 90 cm+ (35 in), men 100 cm+ (39 in)', 'মহিলা ৯০ সেমি+ (৩৫ ইঞ্চি), পুরুষ ১০০ সেমি+ (৩৯ ইঞ্চি)') },
      { v: 'unknown', e: '🤷', l: T('Not sure', 'জানি না') }
    ],
    ask: s => s.a.status !== 'diabetes' && !(s.prev && s.prev.a && s.prev.a.waist && s.prev.weeksAgo < 4),
    tip: v => v === 'unknown'
      ? T('A tailor\'s tape at the navel works. For South Asians, belly size predicts sugar risk better than weight.',
        'দর্জির ফিতে দিয়ে নাভির কাছে মাপুন। দক্ষিণ এশীয়দের ক্ষেত্রে ওজনের চেয়ে পেটের মাপ সুগারের ঝুঁকি ভালো বোঝায়।')
      : T('For South Asians, belly size predicts sugar risk better than body weight alone.',
        'দক্ষিণ এশীয়দের ক্ষেত্রে শুধু ওজনের চেয়ে পেটের মাপ সুগারের ঝুঁকি ভালো বোঝায়।')
  };

  Q.activity = {
    id: 'activity', emoji: '🏃', type: 'single',
    text: T('On most days, how active are you?', 'বেশিরভাগ দিন আপনি কতটা সক্রিয় থাকেন?'),
    options: [
      { v: 'vig', e: '💪', l: T('Exercise or heavy physical work daily', 'রোজ ব্যায়াম বা ভারী শারীরিক পরিশ্রম') },
      { v: 'mod', e: '🚶', l: T('Walk or light exercise about 30 minutes', 'প্রায় ৩০ মিনিট হাঁটা বা হালকা ব্যায়াম') },
      { v: 'light', e: '🧹', l: T('Only light housework', 'শুধু হালকা ঘরের কাজ') },
      { v: 'sit', e: '🪑', l: T('Mostly sitting', 'বেশিরভাগ সময় বসে থাকি') }
    ],
    ask: () => true,
    tip: v => (v === 'light' || v === 'sit')
      ? T('A 10 to 15 minute walk after meals lowers the sugar spike after eating.',
        'খাওয়ার পর ১০ থেকে ১৫ মিনিট হাঁটলে খাবারের পরের সুগার বাড়া কমে।')
      : T('Keep it up. About 150 minutes of activity a week is the usual goal.',
        'চালিয়ে যান। সপ্তাহে প্রায় ১৫০ মিনিট সক্রিয় থাকাই সাধারণ লক্ষ্য।')
  };

  Q.bp = {
    id: 'bp', emoji: '🫀', type: 'single',
    text: T('What about your blood pressure (BP)?', 'আপনার ব্লাড প্রেসার (BP) কেমন?'),
    options: [
      { v: 'treated', e: '💊', l: T('I have high BP and take medicine', 'হাই প্রেসার আছে, ওষুধ খাই') },
      { v: 'untreated', e: '⚠️', l: T('Told it is high, not on medicine', 'বলেছে বেশি, ওষুধ খাই না') },
      { v: 'normal', e: '✅', l: T('Normal when last checked', 'শেষবার মাপার সময় স্বাভাবিক ছিল') },
      { v: 'never', e: '🤷', l: T('Never checked / not sure', 'কখনো মাপাইনি / জানি না') }
    ],
    ask: () => true,
    tip: (v, s) => {
      if (s.a.status === 'diabetes' || v === 'treated' || v === 'untreated')
        return T('Testing BP once a month can help catch diabetic hypertension early.',
          'মাসে একবার প্রেসার মাপলে ডায়াবেটিসজনিত হাই প্রেসার আগেভাগে ধরা পড়ে।');
      if (v === 'never') return T('A BP check takes 2 minutes and is free at government health centres.',
        'প্রেসার মাপতে ২ মিনিট লাগে, সরকারি স্বাস্থ্যকেন্দ্রে বিনামূল্যে হয়।');
      return T('High sugar and high BP often travel together; a yearly BP check is a good habit.',
        'বেশি সুগার আর হাই প্রেসার প্রায়ই একসঙ্গে আসে; বছরে একবার প্রেসার মাপা ভালো অভ্যাস।');
    }
  };

  Q.checks = {
    id: 'checks', emoji: '🧪', type: 'multi', exclusive: 'none',
    text: T('Which of these did you get in the last 12 months?', 'গত ১২ মাসে এগুলোর কোনগুলো করিয়েছেন?'),
    help: T('Pick all that apply.', 'যতগুলো মেলে, সব বেছে নিন।'),
    options: [
      { v: 'eye', e: '👁️', l: T('Eye check (retina)', 'চোখ পরীক্ষা (রেটিনা)') },
      { v: 'foot', e: '🦶', l: T('Foot check by a doctor', 'ডাক্তারকে দিয়ে পা পরীক্ষা') },
      { v: 'kidney', e: '🫘', l: T('Urine or kidney test (ACR / creatinine)', 'ইউরিন বা কিডনি টেস্ট (ACR / ক্রিয়েটিনিন)') },
      { v: 'lipid', e: '🧈', l: T('Cholesterol test', 'কোলেস্টেরল টেস্ট') },
      { v: 'none', e: '🚫', l: T('None of these', 'কোনোটাই না') }
    ],
    ask: s => s.a.status === 'diabetes',
    tip: v => {
      if (!has(v, 'kidney')) return T('Kidney damage from diabetes is silent; a yearly urine ACR test catches it early.',
        'ডায়াবেটিসে কিডনির ক্ষতি চুপচাপ হয়; বছরে একবার ইউরিন ACR টেস্টে আগেভাগে ধরা পড়ে।');
      if (!has(v, 'eye')) return T('A yearly retina check can catch eye damage before your vision changes.',
        'বছরে একবার রেটিনা পরীক্ষায় দৃষ্টি খারাপ হওয়ার আগেই চোখের ক্ষতি ধরা পড়ে।');
      return T('Excellent. These yearly checks are what keep complications away.',
        'চমৎকার। এই বার্ষিক পরীক্ষাগুলোই জটিলতা দূরে রাখে।');
    }
  };

  Q.tobacco = {
    id: 'tobacco', emoji: '🚭', type: 'single',
    text: T('Do you smoke or use gutka, khaini or zarda?', 'আপনি কি ধূমপান করেন বা গুটখা, খৈনি, জর্দা খান?'),
    options: [
      { v: 'no', e: '🙅', l: T('No', 'না') },
      { v: 'quit', e: '🏆', l: T('I quit', 'ছেড়ে দিয়েছি') },
      { v: 'some', e: '🚬', l: T('Sometimes', 'মাঝে মাঝে') },
      { v: 'daily', e: '⚠️', l: T('Daily', 'প্রতিদিন') }
    ],
    ask: () => true,
    tip: v => ({
      quit: T('Quitting is one of the biggest things you can do for your heart. Well done!',
        'তামাক ছাড়া হার্টের জন্য সবচেয়ে বড় উপকারগুলোর একটি। দারুণ!'),
      some: T('Tobacco with high sugar sharply raises heart risk. Free quit help: 1800-11-2356.',
        'বেশি সুগারের সঙ্গে তামাক হার্টের ঝুঁকি অনেক বাড়ায়। বিনামূল্যে ছাড়ার সাহায্য: ১৮০০-১১-২৩৫৬।'),
      daily: T('Tobacco with high sugar sharply raises heart risk. Free quit help: 1800-11-2356.',
        'বেশি সুগারের সঙ্গে তামাক হার্টের ঝুঁকি অনেক বাড়ায়। বিনামূল্যে ছাড়ার সাহায্য: ১৮০০-১১-২৩৫৬।')
    })[v] || null
  };

  Q.diet = {
    id: 'diet', emoji: '🍚', type: 'single',
    text: T('How often do you have sweets, sugary chai, cold drinks or a big plate of white rice?',
      'মিষ্টি, চিনি দেওয়া চা, ঠান্ডা পানীয় বা বড় থালা সাদা ভাত কত ঘন ঘন খান?'),
    options: [
      { v: 'rare', e: '🥗', l: T('Rarely', 'কদাচিৎ') },
      { v: 'daily', e: '☕', l: T('About once a day', 'দিনে একবার মতো') },
      { v: 'many', e: '🍬', l: T('Several times a day', 'দিনে কয়েকবার') }
    ],
    ask: () => true,
    tip: v => v === 'rare' ? T('Nice. Dal, sabzi and whole grains keep sugar steady.',
      'বাহ। ডাল, সবজি আর গোটা শস্য সুগার স্থির রাখে।')
      : T('Easy start: swap half your rice for dal and sabzi, and try chai with less sugar.',
        'সহজ শুরু: অর্ধেক ভাতের বদলে ডাল-সবজি নিন, আর চায়ে চিনি কমান।')
  };

  /* Order decides priority. With a 10-question cap, later items are dropped
     first, so safety and test-timing questions come before habits. */
  const ORDER = ['followup', 'status', 'age', 'symptoms', 'redflag', 'lastTest', 'value',
    'meds', 'lows', 'bp', 'checks', 'family', 'waist', 'activity', 'tobacco', 'diet'];

  /* ------------------------------------------------------------------ */
  /* Contradiction rules                                                */
  /* When answers conflict, a gentle clarifying question is queued next */
  /* (it counts toward the 10). Each rule fires at most once.           */
  /* ------------------------------------------------------------------ */

  const STATUS_LABEL = {
    diabetes: T('you have diabetes', 'আপনার ডায়াবেটিস আছে'),
    borderline: T('your sugar was borderline', 'আপনার সুগার বর্ডারলাইন'),
    normal: T('your sugar was normal', 'আপনার সুগার স্বাভাবিক'),
    unsure: T('you had a sugar test', 'আপনি সুগার টেস্ট করিয়েছিলেন')
  };

  const RULES = [
    {
      id: 'c_told_never',
      check: s => TOLD.includes(s.a.status) && s.a.lastTest === 'never' && !s.inferred.lastTest,
      q: {
        emoji: '🤔', type: 'single', clarify: true,
        text: s => T(
          `Quick check: you said a doctor told you ${STATUS_LABEL[s.a.status].en}, but also that you've never had a sugar test. Which is closer?`,
          `একটু মিলিয়ে নিই: আপনি বলেছেন ডাক্তার জানিয়েছেন ${STATUS_LABEL[s.a.status].bn}, আবার বলেছেন কখনো সুগার টেস্ট করাননি। কোনটা ঠিক?`),
        options: [
          { v: 'long_ago', e: '🕰️', l: T('I was tested once, a long time ago', 'অনেক আগে একবার টেস্ট হয়েছিল'),
            resolve: s => { s.a.lastTest = 'gt3y'; } },
          { v: 'never', e: '🙋', l: T("I've never actually had a test", 'আসলে কখনো টেস্ট করাইনি'),
            resolve: s => { s.a.status = 'never'; } }
        ]
      }
    },
    {
      id: 'c_normal_but_high',
      check: s => s.a.status === 'normal' && ['pre', 'dm', 'high', 'veryhigh'].includes(s.a.value),
      q: {
        emoji: '🤔', type: 'single', clarify: true,
        text: T('You said you were told your sugar is normal, but the number you picked is above normal. What happened?',
          'আপনি বলেছেন সুগার স্বাভাবিক বলা হয়েছিল, কিন্তু যে সংখ্যা বেছেছেন তা স্বাভাবিকের বেশি। ঠিক কী হয়েছিল?'),
        options: [
          { v: 'reviewed', e: '🩺', l: T('A doctor saw the report and said it was fine', 'ডাক্তার রিপোর্ট দেখে বলেছেন ঠিক আছে'),
            resolve: s => { s.flags.doctorReviewed = true; } },
          { v: 'no_review', e: '📄', l: T('No one really looked at the report', 'রিপোর্টটা কেউ ঠিকমতো দেখেনি'),
            resolve: s => { s.a.status = 'unsure'; } },
          { v: 'misremember', e: '🤷', l: T('I may be remembering the number wrong', 'হয়তো সংখ্যাটা ভুল মনে আছে'),
            resolve: s => { s.a.value = 'unknown'; } }
        ]
      }
    },
    {
      id: 'c_dm_normal_nomeds',
      check: s => s.a.status === 'diabetes' && s.a.value === 'normal' && ['stopped', 'none'].includes(s.a.meds),
      q: {
        emoji: '🤔', type: 'single', clarify: true,
        text: T('A normal reading without medicines is possible, but worth checking. When was that normal report from?',
          'ওষুধ ছাড়া স্বাভাবিক রিডিং হতে পারে, তবু মিলিয়ে নেওয়া ভালো। সেই স্বাভাবিক রিপোর্টটা কবেকার?'),
        options: [
          { v: 'before', e: '⏪', l: T('From before I was told I have diabetes', 'ডায়াবেটিস ধরা পড়ার আগের'),
            resolve: s => { s.a.value = 'unknown'; } },
          { v: 'after', e: '✅', l: T('Recent, and my doctor says it is controlled', 'সাম্প্রতিক, ডাক্তার বলেছেন নিয়ন্ত্রণে আছে'),
            resolve: s => { s.flags.doctorReviewed = true; } },
          { v: 'unsure', e: '🤷', l: T('Not sure', 'নিশ্চিত নই'),
            resolve: s => { s.a.value = 'unknown'; } }
        ]
      }
    },
    {
      id: 'c_active_breathless',
      check: s => s.a.activity === 'vig' && has(s.a.symptoms, 'breath'),
      q: {
        emoji: '🤔', type: 'single', clarify: true,
        text: T('You said you are very active, and also get breathless on stairs. Which fits better?',
          'আপনি বলেছেন খুব সক্রিয় থাকেন, আবার সিঁড়িতে হাঁপিয়ে যান। কোনটা বেশি মেলে?'),
        options: [
          { v: 'new_breath', e: '🫁', l: T('I am active, but the breathlessness is new', 'সক্রিয় আছি, কিন্তু হাঁপ ধরা নতুন'),
            resolve: s => { s.flags.newBreathless = true; } },
          { v: 'less_active', e: '🚶', l: T('I am actually less active than I said', 'আসলে যা বলেছি তার চেয়ে কম সক্রিয়'),
            resolve: s => { s.a.activity = 'light'; } }
        ]
      }
    },
    {
      id: 'c_prev_status',
      check: s => {
        const p = s.prev && s.prev.a && s.prev.a.status;
        if (!p || !s.a.status || p === s.a.status) return false;
        if (TOLD.includes(p) && s.a.status === 'never') return true;          // was tested, now "never"
        if (p === 'diabetes' && ['normal', 'borderline'].includes(s.a.status)) return true; // diabetes went away?
        return false;
      },
      q: {
        emoji: '🔁', type: 'single', clarify: true,
        text: s => {
          const p = s.prev.a.status;
          return T(
            `Last time you told us a doctor said ${STATUS_LABEL[p].en}. Today's answer is different. Which is right?`,
            `গতবার আপনি জানিয়েছিলেন ডাক্তার বলেছেন ${STATUS_LABEL[p].bn}। আজকের উত্তর আলাদা। কোনটা ঠিক?`);
        },
        options: [
          { v: 'keep_prev', e: '↩️', l: T('What I said last time is right', 'গতবার যা বলেছি সেটাই ঠিক'),
            resolve: s => { s.a.status = s.prev.a.status; if (s.a.status !== 'never' && s.inferred.lastTest) { delete s.a.lastTest; delete s.inferred.lastTest; } } },
          { v: 'doctor_changed', e: '🩺', l: T('A doctor recently told me it changed', 'সম্প্রতি ডাক্তার বলেছেন বদলেছে'),
            resolve: s => { s.flags.doctorReviewed = true; } },
          { v: 'feel_fine', e: '🙂', l: T('No doctor said so, I just feel fine', 'ডাক্তার বলেননি, আমি শুধু ভালো বোধ করছি'),
            resolve: s => { s.a.status = s.prev.a.status; s.flags.feelFine = true; if (s.inferred.lastTest) { delete s.a.lastTest; delete s.inferred.lastTest; } } }
        ]
      },
      tip: v => v === 'feel_fine'
        ? T('Feeling fine does not always mean sugar is normal. Only a test can tell.',
          'ভালো বোধ করা মানেই সুগার স্বাভাবিক নয়। শুধু টেস্টেই বোঝা যায়।')
        : null
    },
    {
      id: 'c_followup_done_value',
      check: s => s.a.followup === 'done' && s.a.lastTest && s.a.lastTest !== 'lt3m',
      q: {
        emoji: '🤔', type: 'single', clarify: true,
        text: T('You said you got the test done since last time, but your last test date looks older. Which is right?',
          'আপনি বলেছেন গতবারের পর টেস্ট করিয়েছেন, কিন্তু শেষ টেস্টের সময় পুরোনো দেখাচ্ছে। কোনটা ঠিক?'),
        options: [
          { v: 'done', e: '✅', l: T('I did get it done recently', 'সম্প্রতি করিয়েছি'), resolve: s => { s.a.lastTest = 'lt3m'; } },
          { v: 'not_done', e: '⏳', l: T('Actually, not yet', 'আসলে এখনও করাইনি'), resolve: s => { s.a.followup = 'notime'; s.flags.testDone = false; } }
        ]
      }
    }
  ];

  const RULE_BY_ID = Object.fromEntries(RULES.map(r => [r.id, r]));

  function getQ(id) {
    if (Q[id]) return Q[id];
    const r = RULE_BY_ID[id];
    if (r) return Object.assign({ id, ask: () => true, tip: r.tip }, r.q);
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* State                                                              */
  /* ------------------------------------------------------------------ */

  function createState(prev, now) {
    now = now ? new Date(now) : new Date();
    const p = prev ? Object.assign({}, prev) : null;
    if (p && p.date) p.weeksAgo = Math.floor((now - new Date(p.date)) / (7 * DAY));
    return { a: {}, asked: [], pending: [], fired: {}, inferred: {}, flags: {}, contradictions: [], prev: p, now };
  }

  function nextQuestion(s) {
    if (s.asked.length >= MAX_Q) return null;
    if (s.pending.length) return getQ(s.pending[0]);
    for (const id of ORDER) {
      if (id in s.a) continue;
      const q = Q[id];
      if (q.ask(s)) return q;
    }
    return null;
  }

  function applyAnswer(s, qid, value) {
    const q = getQ(qid);
    if (!q) throw new Error('Unknown question ' + qid);
    s.asked.push(qid);
    if (s.pending[0] === qid) s.pending.shift();
    if (q.clarify) {
      const opt = q.options.find(o => o.v === value);
      s.contradictions.push({ rule: qid, choice: value });
      if (opt && opt.resolve) opt.resolve(s);
    } else {
      s.a[qid] = value;
      if (s.inferred[qid]) delete s.inferred[qid];
      if (q.effect) q.effect(s, value);
    }
    for (const r of RULES) {
      if (!s.fired[r.id] && r.check(s)) { s.fired[r.id] = true; s.pending.push(r.id); }
    }
    if (s.asked.length >= MAX_Q && s.pending.length) s.flags.unresolved = true;
    return s;
  }

  /* Rebuild state from an answer log; this is how "Back" works. */
  function replay(prev, log, now) {
    const s = createState(prev, now);
    for (const [qid, v] of log) applyAnswer(s, qid, v);
    return s;
  }

  function tipFor(s, qid, value) {
    const q = getQ(qid);
    return q && q.tip ? q.tip(value, s) || null : null;
  }

  function resolveText(x, s) { return typeof x === 'function' ? x(s) : x; }

  /* ------------------------------------------------------------------ */
  /* Risk score (IDRS, Mohan et al. 2005)                               */
  /* ------------------------------------------------------------------ */

  function idrs(a) {
    const age = { u35: 0, a35: 20, a50: 30, a65: 30 }[a.age];
    const waist = { small: 0, mid: 10, large: 20, unknown: 10 }[a.waist];
    const act = { vig: 0, mod: 10, light: 20, sit: 30 }[a.activity];
    const fam = { none: 0, one: 10, both: 20, unsure: 0 }[a.family];
    const parts = [age, waist, act, fam];
    const known = parts.filter(x => x !== undefined).length;
    const score = parts.reduce((t, x) => t + (x || 0), 0);
    return { score, complete: known === 4, known, band: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low' };
  }

  /* ------------------------------------------------------------------ */
  /* Result: attention level, CKM view, test schedule                   */
  /* ------------------------------------------------------------------ */

  function lastTestDate(s) {
    const m = LAST_TEST_MONTHS[s.a.lastTest];
    if (m == null) return null;
    return new Date(s.now.getTime() - m * 30.4 * DAY);
  }

  /* due = last test + interval, never earlier than `floor` days from now */
  function dueFrom(s, intervalDays, floorDays) {
    const last = lastTestDate(s);
    const base = last ? last.getTime() + intervalDays * DAY : s.now.getTime();
    return Math.max(base, s.now.getTime() + floorDays * DAY);
  }

  function inDays(s, d) { return s.now.getTime() + d * DAY; }

  function buildResult(s) {
    const a = s.a;
    const sym = a.symptoms || [];
    const dm = a.status === 'diabetes';
    const red = Array.isArray(a.redflag) && a.redflag.some(v => v !== 'none');
    const classic = count(sym, CLASSIC);
    const risk = idrs(Object.assign({}, s.prev && s.prev.a, a));
    const valueHighish = ['dm', 'high', 'veryhigh'].includes(a.value);
    const untested = a.lastTest === 'never' || a.lastTest === 'gt3y' || a.status === 'unsure' || a.value === 'unknown';
    const older = ['a35', 'a50', 'a65'].includes(a.age || (s.prev && s.prev.a && s.prev.a.age));

    /* ---- attention level (never a diagnosis) ---- */
    let level = 'good';
    const reasons = [];
    const add = (lv, en, bn) => {
      const rank = { good: 0, watch: 1, soon: 2, urgent: 3 };
      if (rank[lv] > rank[level]) level = lv;
      reasons.push({ lv, t: T(en, bn) });
    };

    if (red) add('urgent', 'You reported a symptom that needs a hospital visit today.', 'আপনি এমন লক্ষণের কথা বলেছেন যার জন্য আজই হাসপাতালে যাওয়া দরকার।');
    if (!dm && valueHighish) add('soon', 'Your last sugar number was above the normal range and should be confirmed by a doctor.', 'আপনার শেষ সুগারের সংখ্যা স্বাভাবিকের বেশি ছিল, ডাক্তারকে দিয়ে নিশ্চিত করানো দরকার।');
    if (!dm && classic >= 2) add('soon', 'You noticed two or more common high-sugar signs.', 'আপনি বেশি সুগারের দুই বা তার বেশি সাধারণ লক্ষণ লক্ষ করেছেন।');
    if (dm && ['high', 'veryhigh'].includes(a.value)) add('soon', 'Your last HbA1c or sugar reading was above the usual target.', 'আপনার শেষ HbA1c বা সুগার রিডিং সাধারণ লক্ষ্যের বেশি ছিল।');
    if (dm && a.meds === 'stopped') add('soon', 'You stopped sugar medicines; a doctor should review this.', 'আপনি সুগারের ওষুধ বন্ধ করেছেন; ডাক্তারের সঙ্গে কথা বলা দরকার।');
    if (a.lows === 'often') add('soon', 'Frequent shaky or sweaty spells can mean low sugar.', 'বারবার কাঁপুনি বা ঘাম সুগার কমে যাওয়ার লক্ষণ হতে পারে।');
    if (a.bp === 'untreated') add('soon', 'You were told your BP is high but are not on treatment.', 'আপনাকে হাই প্রেসার বলা হয়েছে কিন্তু চিকিৎসা চলছে না।');
    if (has(sym, 'swelling') || s.flags.newBreathless) add('soon', 'Swelling or new breathlessness is worth a heart and kidney check.', 'ফোলা বা নতুন করে হাঁপ ধরা হলে হার্ট ও কিডনি পরীক্ষা করানো ভালো।');
    if (dm && has(sym, 'tingling')) add('soon', 'Tingling feet with diabetes should be examined by a doctor.', 'ডায়াবেটিসের সঙ্গে পায়ে ঝিনঝিন হলে ডাক্তারকে দেখানো দরকার।');
    if (a.status === 'borderline' || a.value === 'pre') add('watch', 'Your sugar has been in the borderline zone.', 'আপনার সুগার বর্ডারলাইন সীমায় ছিল।');
    if (dm) add('watch', 'Diabetes needs regular tests even when you feel well.', 'ভালো থাকলেও ডায়াবেটিসে নিয়মিত পরীক্ষা দরকার।');
    if (risk.band === 'high') add('watch', `Your Indian Diabetes Risk Score is ${risk.score} (60+ is high).`, `আপনার ইন্ডিয়ান ডায়াবেটিস রিস্ক স্কোর ${risk.score} (৬০ বা বেশি মানে উচ্চ ঝুঁকি)।`);
    if (!dm && untested && older) add('watch', 'You are over 35 and have no recent sugar result.', 'আপনার বয়স ৩৫-এর বেশি এবং সাম্প্রতিক কোনো সুগার রিপোর্ট নেই।');
    if (a.bp === 'never') add('watch', 'Your BP has not been checked.', 'আপনার প্রেসার মাপা হয়নি।');
    if (a.tobacco === 'daily' || a.tobacco === 'some') add('watch', 'Tobacco adds to heart and kidney risk.', 'তামাক হার্ট ও কিডনির ঝুঁকি বাড়ায়।');

    /* ---- test schedule ---- */
    const sched = [];
    const push = (key, emoji, name, due, why) => sched.push({ key, emoji, name, due, why });

    // Sugar test (fasting glucose + HbA1c)
    if (red) {
      push('sugar', '🚑', T('Hospital visit', 'হাসপাতালে যান'), inDays(s, 0),
        T('Today. Call 108 if needed.', 'আজই। দরকারে ১০৮-এ ফোন করুন।'));
    } else if (dm) {
      let due, why;
      if (a.value === 'veryhigh') { due = inDays(s, 7); why = T('Within a week, with your doctor.', 'এক সপ্তাহের মধ্যে, ডাক্তারের সঙ্গে।'); }
      else if (a.value === 'high' || a.meds === 'stopped' || a.meds === 'miss' || a.lows === 'often' || a.value === 'unknown' || !a.value) {
        due = dueFrom(s, 90, 14); why = T('Every 3 months until it is at target.', 'লক্ষ্যে না পৌঁছানো পর্যন্ত প্রতি ৩ মাসে।');
      } else if (a.value === 'dm') { due = dueFrom(s, 90, 14); why = T('Every 3 months while above 7%.', '৭%-এর বেশি থাকলে প্রতি ৩ মাসে।'); }
      else { due = dueFrom(s, 180, 14); why = T('Every 6 months when at target.', 'লক্ষ্যে থাকলে প্রতি ৬ মাসে।'); }
      push('sugar', '🩸', T('HbA1c test', 'HbA1c টেস্ট'), due, why);
    } else {
      let due, why;
      if (valueHighish) { due = inDays(s, 7); why = T('Repeat test to confirm, and show a doctor.', 'নিশ্চিত হতে আবার টেস্ট করান, ডাক্তার দেখান।'); }
      else if (classic >= 2) { due = inDays(s, 7); why = T('Because of the signs you noticed.', 'আপনার লক্ষণগুলোর জন্য।'); }
      else if (a.status === 'borderline' || a.value === 'pre') { due = dueFrom(s, 180, 14); why = T('Every 6 months in the borderline zone.', 'বর্ডারলাইনে থাকলে প্রতি ৬ মাসে।'); }
      else if (untested && (older || risk.band !== 'low')) { due = inDays(s, 30); why = T('No recent result on file. Get a baseline this month.', 'সাম্প্রতিক রিপোর্ট নেই। এই মাসেই একটা পরীক্ষা করিয়ে নিন।'); }
      else if (risk.band === 'high' || older || has(['one', 'both'], a.family)) { due = dueFrom(s, 365, 14); why = T('Once a year for your risk level.', 'আপনার ঝুঁকির জন্য বছরে একবার।'); }
      else if (untested) { due = inDays(s, 90); why = T('A first baseline test is a good idea.', 'প্রথমবার একটা পরীক্ষা করিয়ে রাখা ভালো।'); }
      else { due = dueFrom(s, 3 * 365, 30); why = T('Every 3 years while young and low risk.', 'কম বয়স ও কম ঝুঁকিতে প্রতি ৩ বছরে।'); }
      push('sugar', '🩸', T('Fasting sugar + HbA1c', 'ফাস্টিং সুগার + HbA1c'), due, why);
    }

    // Blood pressure
    if (a.bp === 'untreated') push('bp', '🫀', T('BP check with a doctor', 'ডাক্তারের কাছে প্রেসার পরীক্ষা'), inDays(s, 14), T('Within 2 weeks.', '২ সপ্তাহের মধ্যে।'));
    else if (a.bp === 'treated') push('bp', '🫀', T('Home BP reading', 'বাড়িতে প্রেসার মাপা'), inDays(s, 7), T('Weekly while on BP medicine.', 'প্রেসারের ওষুধ চললে প্রতি সপ্তাহে।'));
    else if (dm) push('bp', '🫀', T('BP check', 'প্রেসার মাপা'), inDays(s, 30), T('Once a month with diabetes.', 'ডায়াবেটিস থাকলে মাসে একবার।'));
    else if (a.bp === 'never') push('bp', '🫀', T('BP check', 'প্রেসার মাপা'), inDays(s, 30), T('First check this month.', 'এই মাসে প্রথমবার মাপান।'));
    else if (level !== 'good') push('bp', '🫀', T('BP check', 'প্রেসার মাপা'), inDays(s, 90), T('Every 3 months for now.', 'আপাতত প্রতি ৩ মাসে।'));
    else push('bp', '🫀', T('BP check', 'প্রেসার মাপা'), inDays(s, 365), T('Once a year.', 'বছরে একবার।'));

    // Diabetes yearly bundle
    if (dm) {
      const c = a.checks || [];
      const y = (k, emoji, name, notDone) => push(k, emoji, name,
        has(c, k) ? inDays(s, 365) : inDays(s, notDone),
        has(c, k) ? T('Done this year. Next one in a year.', 'এ বছর হয়ে গেছে। পরেরটা এক বছর পরে।')
          : T('Not done in the last year. Book it soon.', 'গত এক বছরে হয়নি। শিগগিরই করান।'));
      y('kidney', '🫘', T('Urine ACR + creatinine (kidney)', 'ইউরিন ACR + ক্রিয়েটিনিন (কিডনি)'), 30);
      y('eye', '👁️', T('Eye (retina) check', 'চোখ (রেটিনা) পরীক্ষা'), 60);
      y('foot', '🦶', T('Foot check by a doctor', 'ডাক্তারকে দিয়ে পা পরীক্ষা'), 30);
      y('lipid', '🧈', T('Cholesterol test', 'কোলেস্টেরল টেস্ট'), 60);
    } else if (a.bp === 'treated' || a.bp === 'untreated' || has(sym, 'swelling')) {
      push('kidney', '🫘', T('Urine ACR + creatinine (kidney)', 'ইউরিন ACR + ক্রিয়েটিনিন (কিডনি)'), inDays(s, 60),
        T('High BP can strain the kidneys; a yearly urine test checks them.', 'হাই প্রেসার কিডনির ওপর চাপ ফেলে; বছরে একবার ইউরিন টেস্টে দেখা যায়।'));
    }
    if (!dm && older && (a.status === 'borderline' || a.value === 'pre' || risk.band === 'high' || a.bp === 'treated' || a.bp === 'untreated')) {
      push('lipid', '🧈', T('Cholesterol test', 'কোলেস্টেরল টেস্ট'), inDays(s, 90), T('Heart risk rises with sugar and BP.', 'সুগার ও প্রেসারের সঙ্গে হার্টের ঝুঁকি বাড়ে।'));
    }

    sched.sort((x, y) => x.due - y.due);

    /* ---- CKM view: 4 tiles ---- */
    const tile = st => st;
    const sugarState = red ? 'act' : dm ? (['high', 'veryhigh'].includes(a.value) || a.meds === 'stopped' ? 'act' : 'watch')
      : valueHighish || classic >= 2 ? 'act' : (a.status === 'borderline' || a.value === 'pre') ? 'watch'
        : untested ? 'unknown' : 'good';
    const heartState = (has(sym, 'breath') || s.flags.newBreathless || a.bp === 'untreated') ? 'act'
      : (a.bp === 'treated' || a.tobacco === 'daily' || a.tobacco === 'some') ? 'watch'
        : (a.bp === 'never' || !a.bp) ? 'unknown' : 'good';
    const weightState = a.waist === 'large' || a.activity === 'sit' ? 'watch'
      : a.waist === 'mid' || a.activity === 'light' ? 'watch'
        : (!a.waist && !a.activity) || a.waist === 'unknown' ? 'unknown' : 'good';
    const kidneyState = has(sym, 'swelling') ? 'act'
      : dm ? (has(a.checks, 'kidney') ? 'good' : 'unknown')
        : (a.bp === 'treated' || a.bp === 'untreated') ? 'unknown' : 'good';
    const ckm = [
      { key: 'sugar', emoji: '🩸', name: T('Sugar', 'সুগার'), st: tile(sugarState) },
      { key: 'heart', emoji: '🫀', name: T('Heart & BP', 'হার্ট ও প্রেসার'), st: tile(heartState) },
      { key: 'weight', emoji: '📏', name: T('Belly & activity', 'পেট ও সক্রিয়তা'), st: tile(weightState) },
      { key: 'kidney', emoji: '🫘', name: T('Kidney', 'কিডনি'), st: tile(kidneyState) }
    ];

    /* ---- outlook: evidence-based, not a personal prediction ---- */
    let outlook;
    if (red) outlook = T('Getting care today matters most. Everything else can wait.', 'আজ চিকিৎসা পাওয়াটাই সবচেয়ে জরুরি। বাকি সব পরে হবে।');
    else if (!dm && (a.status === 'borderline' || a.value === 'pre'))
      outlook = T('Borderline sugar does not have to become diabetes. In the Indian Diabetes Prevention Programme, lifestyle change lowered that chance by about 28%.',
        'বর্ডারলাইন সুগার মানেই ডায়াবেটিস হবে, তা নয়। ভারতের ডায়াবেটিস প্রতিরোধ গবেষণায় জীবনযাত্রা বদলে সেই সম্ভাবনা প্রায় ২৮% কমেছিল।');
    else if (dm && ['dm', 'high', 'veryhigh'].includes(a.value))
      outlook = T('Bringing HbA1c down pays off: in the UKPDS study, each 1% drop was linked to about 21% fewer diabetes-related deaths.',
        'HbA1c কমালে উপকার মেলে: UKPDS গবেষণায় প্রতি ১% কমার সঙ্গে ডায়াবেটিসজনিত মৃত্যু প্রায় ২১% কমেছিল।');
    else if (dm)
      outlook = T('People who keep up yearly eye, kidney and foot checks catch problems while they are still easy to treat.',
        'যাঁরা প্রতি বছর চোখ, কিডনি আর পা পরীক্ষা করান, তাঁদের সমস্যা সহজে সারানোর সময়েই ধরা পড়ে।');
    else if (untested)
      outlook = T('The ICMR-INDIAB study found about 1 in 9 Indian adults has diabetes and about 1 in 7 has prediabetes, many without knowing. One test settles it.',
        'ICMR-INDIAB গবেষণায় দেখা গেছে প্রায় প্রতি ৯ জন ভারতীয় প্রাপ্তবয়স্কের ১ জনের ডায়াবেটিস আর প্রতি ৭ জনের ১ জনের প্রি-ডায়াবেটিস আছে, অনেকেই জানেন না। একটা টেস্টেই বোঝা যায়।');
    else outlook = T('You are in a good place. Small daily habits and a yearly check keep it that way.',
      'আপনি ভালো জায়গায় আছেন। রোজকার ছোট অভ্যাস আর বছরে একবার পরীক্ষা, এভাবেই ভালো থাকবেন।');

    /* ---- one or two habit nudges ---- */
    const nudges = [];
    if (a.activity === 'sit' || a.activity === 'light') nudges.push(T('🚶 Walk 10 minutes after lunch and dinner this week.', '🚶 এই সপ্তাহে দুপুর আর রাতের খাওয়ার পর ১০ মিনিট হাঁটুন।'));
    if (a.diet === 'many' || a.diet === 'daily') nudges.push(T('🍚 Swap half your rice for dal and sabzi at one meal a day.', '🍚 দিনে একবেলা অর্ধেক ভাতের বদলে ডাল-সবজি নিন।'));
    if (a.tobacco === 'daily' || a.tobacco === 'some') nudges.push(T('🚭 Call 1800-11-2356 for free help to quit tobacco.', '🚭 তামাক ছাড়তে বিনামূল্যে সাহায্যের জন্য ১৮০০-১১-২৩৫৬-এ ফোন করুন।'));
    if (a.meds === 'miss') nudges.push(T('⏰ Set a daily phone alarm for your tablets.', '⏰ ট্যাবলেটের জন্য ফোনে রোজ অ্যালার্ম দিন।'));
    if (dm) nudges.push(T('🦶 Look at your feet every night for cuts or colour change.', '🦶 রোজ রাতে পায়ে কাটা বা রং বদল দেখুন।'));
    if (!nudges.length) nudges.push(T('💧 Keep it up: water over cold drinks, and stay active.', '💧 এভাবেই চালিয়ে যান: ঠান্ডা পানীয়ের বদলে জল, আর সক্রিয় থাকুন।'));

    return {
      level, reasons, schedule: sched, ckm, outlook, nudges: nudges.slice(0, 3), risk,
      contradictions: s.contradictions, unresolved: !!s.flags.unresolved, asked: s.asked.length
    };
  }

  /* ------------------------------------------------------------------ */
  /* Continuity: the follow-up item from last week, if due              */
  /* ------------------------------------------------------------------ */

  function followupItem(s) {
    if (!s.prev || !Array.isArray(s.prev.schedule) || !s.prev.date) return null;
    const item = s.prev.schedule.find(x => x.key === 'sugar');
    if (!item) return null;
    // Ask once the suggested date is within 2 weeks (or passed) and at least a week has gone by.
    const soon = item.due <= s.now.getTime() + 14 * DAY;
    const gap = s.now - new Date(s.prev.date) >= 6 * DAY;
    return soon && gap ? item : null;
  }

  /* ------------------------------------------------------------------ */
  /* Points: earned once per week, streak bonus for consecutive weeks   */
  /* ------------------------------------------------------------------ */

  function weekIndex(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Math.floor((d.getTime() - dow * DAY + 3 * DAY) / (7 * DAY));
  }

  function awardPoints(store, s, now) {
    now = now ? new Date(now) : new Date();
    const wk = weekIndex(now);
    const st = Object.assign({ points: 0, streak: 0, lastWeek: null, badges: [] }, store);
    if (st.lastWeek === wk) return { store: st, earned: 0, already: true, breakdown: [], newBadges: [] };
    const bd = [];
    bd.push({ k: 'answers', p: s.asked.length * 10 });
    bd.push({ k: 'complete', p: 50 });
    const streak = st.lastWeek === wk - 1 ? st.streak + 1 : 1;
    if (streak > 1) bd.push({ k: 'streak', p: 20 * Math.min(streak, 5) });
    if (s.flags.testDone) bd.push({ k: 'testDone', p: 100 });
    const earned = bd.reduce((t, x) => t + x.p, 0);
    const out = Object.assign({}, st, { points: st.points + earned, streak, lastWeek: wk });
    const badges = new Set(st.badges || []);
    const newBadges = [];
    const give = b => { if (!badges.has(b)) { badges.add(b); newBadges.push(b); } };
    give('first');
    if (streak >= 4) give('streak4');
    if (s.flags.testDone) give('tested');
    if (out.points >= 500) give('p500');
    out.badges = [...badges];
    return { store: out, earned, already: false, breakdown: bd, streak, newBadges };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                            */
  /* ------------------------------------------------------------------ */

  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
  const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const bnNum = n => String(n).replace(/\d/g, d => BN_DIGITS[d]);

  function fmtDate(d, lang) {
    d = new Date(d);
    return lang === 'bn'
      ? `${bnNum(d.getDate())} ${BN_MONTHS[d.getMonth()]} ${bnNum(d.getFullYear())}`
      : `${d.getDate()} ${EN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  /* Snapshot saved for next week's continuity checks */
  function snapshot(s, result) {
    return {
      date: s.now.toISOString(),
      a: Object.assign({}, s.prev && s.prev.a, s.a),
      level: result.level,
      schedule: result.schedule.map(x => ({ key: x.key, due: x.due }))
    };
  }

  const API = {
    MAX_Q, Q, ORDER, RULES, getQ, createState, nextQuestion, applyAnswer, replay, tipFor,
    resolveText, buildResult, idrs, awardPoints, weekIndex, fmtDate, bnNum, snapshot, followupItem
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SmaranCheckin = API;
})(typeof window !== 'undefined' ? window : globalThis);
