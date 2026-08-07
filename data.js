/**
 * data.js — Static content: milestones, quotes, insights.
 */

/** Daily insight shown on the weekly timeline card (Day 1–7 of each streak week). */
const WEEKLY_DAY_INSIGHTS = {
    1: { title: "Beginner's Mind",           body: "Every week begins the same way—with humility. Yesterday's success doesn't replace today's commitment." },
    2: { title: 'Show Up Again', body: 'Big changes are built from small, consistent actions. Keep showing up—one day at a time.' },
    3: { title: 'Stay Grounded',             body: 'Confidence is earned. Overconfidence is borrowed. Stay grounded and keep making good choices.' },
    4: { title: 'Progress, Not Perfection',  body: "You've come this far by staying consistent, not by being perfect. Continue the habit that got you here." },
    5: { title: 'Awareness',                 body: 'Notice your thoughts, urges, and triggers without judging them. Awareness gives you the power to choose.' },
    6: { title: 'Discipline Over Motivation', body: "Strength isn't measured by one great day. It's built through the quiet consistency of many ordinary days." },
    7: { title: 'Finish Strong', body: 'One day left. Cross the line—then prove you can do it again next week.' },
};

/** Shown on the calendar day a streak breaks — before Day 1 restarts tomorrow. */
const WEEKLY_SLIP_REFLECT = {
    title: 'Pause & Reflect',
    body: "Today didn't go as planned. Reflect on what happened today. Tomorrow is Day 1 again—not as a punishment, but as another opportunity to begin with beginner's mind.",
};

const TOAST_MESSAGES = [
    '💪 Another day won. You\'re unstoppable.',
    '🔥 Streak alive! Keep the fire burning.',
    '✨ One more brick in the wall of discipline.',
    '🌱 Small wins compound into big change.',
    '⚡ You chose strength today. Own it.',
    '🎯 Locked in. One day at a time.',
    '🏆 Champions are built on days like this.',
    '🌟 Discipline is freedom — and you just earned some.',
    '💎 Hard days will come. Today wasn\'t one. Good.',
    '🙌 Done for the day. Rest with pride.',
    '🚀 Momentum building. Don\'t stop now.',
    '🧠 Your future self is thanking you.',
    '🌊 Steady. Strong. Unbroken.',
    '✅ Today\'s battle: yours. Keep going.',
    '🦁 Resilience looks good on you.',
    '🌄 Every sunrise, a new chance. You took it.',
    '⭐ You showed up. That\'s everything.',
    '🔑 Consistency is the key. You turned it today.',
    '🛡️ Another day, another temptation beaten.',
    '🌿 Growth is quiet. But it\'s happening.',
];

const STREAK_MILESTONES = {
    1:   { emoji: '⚡', stage: 'FIRST STEP',   title: 'Day 1 Done.',              message: 'First step taken. Your first target is 75 strong days. The journey has begun.' },
    3:   { emoji: '🔥', stage: 'EARLY BATTLE', title: '3-Day Streak!',            message: 'Three days of staying strong. The battle is real — and you\'re winning it.' },
    7:   { emoji: '📅', stage: 'WEEK 1',        title: 'First Full Week!',         message: 'One complete week! The neural pathways are starting to rewire. Keep pushing.' },
    10:  { emoji: '🌟', stage: 'TEN DAYS',      title: '10 Days Strong!',          message: 'Double digits! Your willpower muscle is visibly growing stronger.' },
    14:  { emoji: '🌿', stage: 'WEEK 2',        title: 'Two Weeks Down!',          message: 'Fourteen days of discipline. The habit is beginning to take root.' },
    21:  { emoji: '🌱', stage: 'WEEK 3',        title: 'Three Weeks!',             message: '21 days — the classic milestone where habits start to feel natural.' },
    30:  { emoji: '💪', stage: 'ONE MONTH',     title: 'One Full Month!',          message: 'A whole month of strength. You\'re building an identity, not just a habit.' },
    50:  { emoji: '⭐', stage: '50 DAYS',       title: '50-Day Streak!',           message: 'FIFTY days. This is elite territory. You are genuinely changing who you are.' },
    90:  { emoji: '🔱', stage: '90 DAYS',       title: '90-Day Streak!',           message: 'NINETY DAYS. The community knows this number. You\'ve crossed the line most never reach. This is a new identity.' },
    100: { emoji: '💯', stage: '100 DAYS',      title: '100-Day Streak!',          message: 'ONE HUNDRED DAYS. This is extraordinary. You\'ve proven this is who you are now.' },
    150: { emoji: '⚔️',  stage: '150 DAYS',      title: '150-Day Streak!',          message: '150 days of unbroken strength. You are not the same person who started. This is mastery in progress.' },
    200: { emoji: '🛡️',  stage: '200 DAYS',      title: '200-Day Streak!',          message: 'Two hundred days. Unshaken, unbroken, unstoppable. The Warrior in you is real.' },
    250: { emoji: '⚡', stage: '250 DAYS',      title: '250-Day Streak!',          message: '250 days of pure discipline. You have built something most people will never experience. Keep going.' },
    300: { emoji: '💎', stage: '300 DAYS',      title: '300-Day Streak!',          message: 'THREE HUNDRED DAYS. Diamond-grade willpower. You are in the top 0.1% of anyone who has ever attempted this.' },
    365: { emoji: '👑', stage: 'ONE YEAR',      title: 'One Full Year! 👑',        message: 'A FULL YEAR. 365 days of choosing yourself every single day. You are the King. The crown is yours.' },
};

// Journey sober-day milestone data (keyed by day count)
const JOURNEY_MILESTONES = {
    75:   { emoji: '🌱', stage: 'STRONG',   title: '75 Journey Days!',      message: 'Seventy-five successful days. Your identity is shifting. Next target — 100 strong days.' },
    100:  { emoji: '🔥', stage: 'STRONG',   title: '100 Journey Days!',     message: 'A century of success. Absolute mental strength. Next target — 150 strong days.' },
    150:  { emoji: '⚔️',  stage: 'STRONG',   title: '150 Journey Days!',     message: '150 days of winning. You\'re a completely different person now. Next target — 200 strong days.' },
    200:  { emoji: '🛡️',  stage: 'WARRIOR',  title: '200 Journey Days!',     message: 'Two hundred days of endurance. This is who you truly are. Next target — 300 strong days.' },
    300:  { emoji: '⚡', stage: 'WARRIOR',  title: '300 Journey Days!',     message: '300 days! You\'ve entered a realm most people never reach. Next target — 400 strong days.' },
    400:  { emoji: '💎', stage: 'WARRIOR',  title: '400 Journey Days!',     message: '400 days of pure diamond-grade discipline. Unbreakable. Next target — 500 strong days.' },
    500:  { emoji: '🦁', stage: 'KING',     title: '500 Journey Days!',     message: 'FIVE HUNDRED. You are legendary. Next target — 750 strong days.' },
    750:  { emoji: '🦅', stage: 'KING',     title: '750 Journey Days!',     message: '750 days. You soar above 99.9% of everyone. Next target — 1000 strong days. The crown awaits.' },
    1000: { emoji: '👑', stage: 'KING',     title: '1000 Journey Days! 👑', message: 'ONE THOUSAND DAYS. You are the King. You have arrived.' },
};

/** Sorted milestone thresholds — single source for counters and backfill. */
const JOURNEY_MILESTONE_DAYS = Object.keys(JOURNEY_MILESTONES).map(Number).sort((a, b) => a - b);

// Success rate shown only at journey strong-day milestones
const JOURNEY_SHOW_RATE = new Set([75, 100, 150, 200, 300, 400, 500, 750, 1000]);

const BRAIN_PHASES = [
    {
        from: 0,   to: 3,
        emoji: '⚡', phase: 'Withdrawal',
        desc: 'Your dopamine receptors are recalibrating. Irritability, restlessness and flatness are normal — your brain is adjusting to life without supernormal stimulation.',
    },
    {
        from: 3,   to: 14,
        emoji: '🌫️', phase: 'Flatline',
        desc: 'Libido drops, motivation feels low. This is your brain downregulating dopamine sensitivity — painful but a clear sign of healing. Hold the line.',
    },
    {
        from: 14,  to: 30,
        emoji: '🌱', phase: 'Early Rewiring',
        desc: 'Prefrontal cortex activity is increasing. Impulse control improves, sleep deepens, social anxiety reduces. The fog is lifting.',
    },
    {
        from: 30,  to: 60,
        emoji: '⚗️', phase: 'Neuroplasticity Window',
        desc: 'Dopamine D2 receptors are recovering. Grey matter is rebuilding. Motivation and mood stabilise. This is where real change takes root.',
    },
    {
        from: 60,  to: 90,
        emoji: '🔥', phase: 'Identity Shift',
        desc: 'Measurable prefrontal cortex improvement. Better decisions, emotional regulation, deeper empathy. New neural pathways are solidifying.',
    },
    {
        from: 90,  to: 180,
        emoji: '💎', phase: 'Consolidation',
        desc: 'Dopamine system largely recovered. Urges are weaker and less frequent. Relationships deepen. You are not the same person who started.',
    },
    {
        from: 180, to: 365,
        emoji: '🦅', phase: 'Long-term Stability',
        desc: 'Brain function normalised. What once required willpower now comes from identity. This is who you are.',
    },
    {
        from: 365, to: Infinity,
        emoji: '👑', phase: 'Mastery',
        desc: 'A year of freedom. Your brain has fully rewired. You have achieved what most people never attempt. This is a permanent transformation.',
    },
];

const KNOWLEDGE_FACTS = [
    { emoji: '🧠', headline: 'Porn triggers the same dopamine as cocaine.', body: 'That\'s why stopping feels impossible — and why every strong day literally rewires your reward circuit.' },
    { emoji: '⚡', headline: 'Urges last 10–20 minutes on average.', body: 'Every urge you survive without acting on weakens the neural pathway that created it. Time is your weapon.' },
    { emoji: '💪', headline: 'Willpower is a muscle — it grows with use.', body: 'Each time you resist, your prefrontal cortex gets stronger. You are literally building discipline.' },
    { emoji: '🌱', headline: 'The brain starts rewiring within 2 weeks.', body: 'Prefrontal cortex activity increases, impulse control improves, and brain fog begins to lift.' },
    { emoji: '🔥', headline: 'Dopamine D2 receptors recover by Day 30–60.', body: 'These are the receptors that let you feel pleasure from everyday life. They come back. So does joy.' },
    { emoji: '🎯', headline: 'Your streak is proof, not just a number.', body: 'Every day on that counter is a decision you made under pressure. Nobody can take that from you.' },
    { emoji: '😴', headline: 'Sleep quality improves significantly after 2 weeks.', body: 'Pornography disrupts REM sleep cycles. Abstaining restores deeper, more restorative sleep.' },
    { emoji: '👥', headline: 'Social anxiety reduces as dopamine rebalances.', body: 'Hypersexualisation of social situations fades. Real conversations feel easier and more genuine.' },
    { emoji: '⚗️', headline: 'Grey matter volume recovers with abstinence.', body: 'Brain imaging studies show measurable grey matter restoration in regions controlling behaviour and emotion.' },
    { emoji: '🏆', headline: 'Identity change is more powerful than willpower.', body: 'The question isn\'t "can I resist today" — it\'s "who am I?" Someone who doesn\'t do this anymore doesn\'t need willpower.' },
    { emoji: '🌊', headline: 'Urge surfing works because urges are waves.', body: 'They peak, they crest, they fall. No urge has ever lasted forever. You just have to outlast it.' },
    { emoji: '💡', headline: 'Boredom is the #1 trigger — not stress.', body: 'Research shows idle time drives more relapses than emotional pain. Filling your time deliberately is a recovery strategy.' },
    { emoji: '🔄', headline: 'Relapse does not erase progress.', body: 'Neural pathways you\'ve built don\'t disappear. Every day of strength is permanently wired in, even after a slip.' },
    { emoji: '📈', headline: 'Recovery is not linear — and that\'s normal.', body: 'The average person attempting recovery makes multiple attempts. Each one teaches you something. You are on the right path.' },
    { emoji: '🧬', headline: 'Testosterone levels normalise after 90 days.', body: 'Studies report increased energy, drive, and confidence as the hormonal system rebalances with abstinence.' },
    { emoji: '🎭', headline: 'Porn creates unrealistic expectations — recovery restores reality.', body: 'Real intimacy, real emotion, and real connection become more accessible as the brain resets.' },
    { emoji: '⏰', headline: 'The 72-hour window is the hardest.', body: 'The first 3 days have the strongest withdrawal. If you can get past Day 3, your chances of continuing improve dramatically.' },
    { emoji: '🛡️', headline: 'Avoiding triggers is not weakness — it\'s strategy.', body: 'Elite athletes control their environment. So do people in serious recovery. Knowing your triggers and preparing for them is strength.' },
    { emoji: '🌙', headline: 'Late night is the highest risk window for most people.', body: 'Fatigue lowers prefrontal control. A simple rule — phone away at 10pm — prevents more relapses than any amount of willpower.' },
    { emoji: '🦁', headline: 'Every journey you start is not failure — it\'s data.', body: 'You learn your triggers, your patterns, your weak points. Journey 3 is smarter than Journey 1. You are not starting over. You are going deeper.' },
];