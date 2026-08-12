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
    // Day 1 long copy only on first streak of a Journey (see triggerStreakMilestone).
    1:   { emoji: '⚡', stage: 'FIRST STEP',   title: 'Day 1 Done.',              message: 'Your first target is to achieve a Journey of 75 days.' },
    3:   { emoji: '🔥', stage: 'EARLY BATTLE', title: '3-Day Streak!',            message: 'Three days of staying strong. The battle is real — and you\'re winning it.' },
    7:   { emoji: '📅', stage: 'WEEK 1',        title: 'First Full Week!',         message: 'One complete week. The Journey is real now — stay honest with strong days and slips.' },
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
    300: { emoji: '💎', stage: '300 DAYS',      title: '300-Day Streak!',          message: '300 days. You\'ve gone further than almost anyone who has ever tried.' },
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

// Inclusive day ranges (streak day N is in a phase when from <= N <= to).
const BRAIN_PHASES = [
    {
        from: 1,   to: 3,
        emoji: '⚡', phase: 'Withdrawal',
        desc: 'Your dopamine receptors are recalibrating. Irritability, restlessness and flatness are normal — your brain is adjusting to life without supernormal stimulation.',
    },
    {
        from: 4,   to: 14,
        emoji: '🌫️', phase: 'Flatline',
        desc: 'Libido drops, motivation feels low. This is your brain downregulating dopamine sensitivity — painful but a clear sign of healing. Hold the line.',
    },
    {
        from: 15,  to: 30,
        emoji: '🌱', phase: 'Early Rewiring',
        desc: 'Prefrontal cortex activity is increasing. Impulse control improves, sleep deepens, social anxiety reduces. The fog is lifting.',
    },
    {
        from: 31,  to: 60,
        emoji: '⚗️', phase: 'Neuroplasticity Window',
        desc: 'Dopamine D2 receptors are recovering. Grey matter is rebuilding. Motivation and mood stabilise. This is where real change takes root.',
    },
    {
        from: 61,  to: 90,
        emoji: '🔥', phase: 'Identity Shift',
        desc: 'Measurable prefrontal cortex improvement. Better decisions, emotional regulation, deeper empathy. New neural pathways are solidifying.',
    },
    {
        from: 91,  to: 180,
        emoji: '💎', phase: 'Consolidation',
        desc: 'Dopamine system largely recovered. Urges are weaker and less frequent. Relationships deepen. You are not the same person who started.',
    },
    {
        from: 181, to: 365,
        emoji: '🦅', phase: 'Long-term Stability',
        desc: 'Brain function normalised. What once required willpower now comes from identity. This is who you are.',
    },
    {
        from: 366, to: Infinity,
        emoji: '👑', phase: 'Mastery',
        desc: 'A year of freedom. Your brain has significantly rewired. The patterns you\'ve built are deep and lasting — but the daily choice still matters.',
    },
];

const KNOWLEDGE_FACTS = [
    { emoji: '🧠', headline: 'Pornography can strongly engage the brain\'s reward and motivation systems.', body: 'That is why the pull can feel so strong — and why every strong day you log still counts on the Journey.' },
    { emoji: '⚡', headline: 'Urges come in waves.', body: 'You do not have to win forever in one second. Ride it without acting. The point is the choice — not a guarantee it vanishes.' },
    { emoji: '💪', headline: 'Discipline is reps, not speeches.', body: 'Each time you log strong instead of slip, you bank a decision. That is how Kings train — one measured day at a time.' },
    { emoji: '🌱', headline: 'Two weeks of strong days changes the feel of the fight.', body: 'Fog lifts, sleep often improves, and decisions get cleaner. Stay honest with the log either way.' },
    { emoji: '🔥', headline: 'Joy returns to ordinary life.', body: 'The more you stop overloading the next hit, the more normal wins feel like enough again. That is the point of progress.' },
    { emoji: '🎯', headline: 'Your streak is proof, not just a number.', body: 'Every day on that counter is a decision you made under pressure. Nobody can take that from you.' },
    { emoji: '😴', headline: 'Sleep often improves when the night habit breaks.', body: 'Late screens and late urges eat rest. Guarding the night is part of guarding the Journey.' },
    { emoji: '👥', headline: 'Real connection gets easier with time.', body: 'When your mind is not scanning for the next hit, conversations and presence get room to matter again.' },
    { emoji: '🏆', headline: 'Identity beats white-knuckle willpower.', body: 'The question isn\'t only "can I resist today" — it\'s "who am I?" Someone who keeps choosing better doesn\'t need a perfect streak to lead.' },
    { emoji: '🌊', headline: 'Urge surfing is an optional pause tool.', body: 'Ride the urge without acting on it. Breathing here is a way to wait and choose — not a promise the urge will disappear.' },
    { emoji: '💡', headline: 'Boredom is often the real enemy.', body: 'Empty hours invite the old pattern more than big drama does. Fill the day on purpose — that is strategy, not shame.' },
    { emoji: '🔄', headline: 'A slip does not erase your Journey.', body: 'Strong days still count. Powers used still teach. Fail forward, log honest, start the next stretch smarter.' },
    { emoji: '📈', headline: 'Progress is not a straight line.', body: 'Journeys rise and fall. King exists so you can measure distance across slips — not pretend you never slip.' },
    { emoji: '🧬', headline: 'Energy, drive, and confidence are commonly reported after 90 days of abstinence.', body: 'Many people describe more energy and steady mood with time — individual results vary. Keep measuring your Journey.' },
    { emoji: '🎭', headline: 'Real life beats fantasy loops.', body: 'The more you choose presence over escape, the more intimacy and emotion get room to feel real again.' },
    { emoji: '⏰', headline: 'The first three days are the steep climb.', body: 'If you can log through Day 1–3 with honesty, you have already taken the first step of a real Journey.' },
    { emoji: '🛡️', headline: 'Avoiding triggers is strategy.', body: 'Kings control the board. Know your weak hours, fix the environment, and protect what remains of your Powers.' },
    { emoji: '🌙', headline: 'Late night is high risk for most people.', body: 'Tired minds make thinner choices. Phone away, lights down — small rules that save more Journeys than raw willpower.' },
    { emoji: '🦁', headline: 'Every Journey is data, not failure.', body: 'You learn triggers, patterns, and weak points. Journey 3 is smarter than Journey 1. You are not starting over — you are going farther.' },
];

