import type {
  LearnerAttemptAdaptiveImpactKind,
  LearnerAttemptEvidenceContract,
  LearnerAttemptPathKind,
  LearningExclusionReasonCode,
} from "@/lib/learning-evidence-contract";

export const UI_LOCALE_COOKIE_NAME = "eduai_ui_locale";
export const UI_LOCALES = ["en", "ru"] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const DEFAULT_UI_LOCALE: UiLocale = "en";

const DATE_LOCALES: Record<UiLocale, string> = {
  en: "en-US",
  ru: "ru-RU",
};

const AXIS_LABELS = {
  en: {
    cognitive_process: "Cognitive process",
    context: "Context",
    depth: "Explanation depth",
    difficulty_target: "Difficulty target",
    explanation_style: "Explanation style",
    format: "Format",
    response_format: "Practice format",
    style: "Style",
    task_family: "Task family",
    task_type: "Task type",
    tone: "Tone",
  },
  ru: {
    cognitive_process: "Когнитивный процесс",
    context: "Контекст",
    depth: "Глубина объяснения",
    difficulty_target: "Целевая сложность",
    explanation_style: "Стиль объяснения",
    format: "Формат",
    response_format: "Формат практики",
    style: "Стиль",
    task_family: "Семейство задач",
    task_type: "Тип задания",
    tone: "Тон",
  },
};

const DIFFICULTY_LABELS = {
  en: {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    unknown: "Unknown",
    keepCurrent: "keep current",
  },
  ru: {
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Сложный",
    unknown: "Неизвестно",
    keepCurrent: "оставить текущий",
  },
} as const;

const PREFERENCE_VALUE_LABELS = {
  en: {
    cognitive_process: {
      analyze: "Analyze",
      apply: "Apply",
      recall: "Recall",
    },
    context: {
      abstract: "Abstract",
      real_world: "Real world",
    },
    depth: {
      brief: "Brief",
      detailed: "Detailed",
      standard: "Standard",
    },
    explanation_style: {
      concise: "Concise",
      exploratory: "Exploratory",
      stepwise: "Stepwise",
    },
    response_format: {
      mcq: "Multiple choice",
    },
    task_family: {
      comparison: "Comparison",
      definition: "Definition",
      problem_solving: "Problem solving",
    },
    tone: {
      direct: "Direct",
      formal: "Formal",
      friendly: "Friendly",
    },
  },
  ru: {
    cognitive_process: {
      analyze: "Анализ",
      apply: "Применение",
      recall: "Воспроизведение",
    },
    context: {
      abstract: "Абстрактный",
      real_world: "Из реального мира",
    },
    depth: {
      brief: "Краткая",
      detailed: "Подробная",
      standard: "Сбалансированная",
    },
    explanation_style: {
      concise: "Краткий",
      exploratory: "Исследовательский",
      stepwise: "Пошаговый",
    },
    response_format: {
      mcq: "Выбор ответа",
    },
    task_family: {
      comparison: "Сравнение",
      definition: "Определение",
      problem_solving: "Решение задач",
    },
    tone: {
      direct: "Прямой",
      formal: "Формальный",
      friendly: "Дружелюбный",
    },
  },
} as const;

const EPISODE_ROLE_LABELS = {
  en: {
    precheck: "Precheck",
    learning_content: "Learning content",
    postcheck: "Postcheck",
    holdout: "Final check",
    delayed_recheck: "Delayed recheck",
  },
  ru: {
    precheck: "Предпроверка",
    learning_content: "Учебный шаг",
    postcheck: "Постпроверка",
    holdout: "Итоговая проверка",
    delayed_recheck: "Отложенная перепроверка",
  },
} as const;

const EPISODE_STATUS_LABELS = {
  en: {
    ready: "Ready",
    awaiting_test_submission: "Answer and submit",
    acknowledge_learning_content: "Read and continue",
    pending_materialization: "Ready to continue",
    waiting_delay: "Waiting for later recheck",
    completed: "Episode completed",
  },
  ru: {
    ready: "Готово",
    awaiting_test_submission: "Ответьте и отправьте",
    acknowledge_learning_content: "Прочитайте и продолжайте",
    pending_materialization: "Готово к продолжению",
    waiting_delay: "Ожидание более поздней перепроверки",
    completed: "Эпизод завершён",
  },
} as const;

const ATTEMPT_PATH_LABELS = {
  en: {
    learn_episode: "Learn episode",
    custom_practice: "Custom practice",
    standalone_assessment: "Standalone assessment",
  },
  ru: {
    learn_episode: "Учебный эпизод",
    custom_practice: "Быстрая практика",
    standalone_assessment: "Отдельная проверка",
  },
} as const;

const ADAPTIVE_IMPACT_LABELS = {
  en: {
    canonical_learn_update: "Updated",
    secondary_practice_update: "Updated",
    standalone_assessment_update: "Updated",
    record_only: "Unchanged",
  },
  ru: {
    canonical_learn_update: "Обновлено",
    secondary_practice_update: "Обновлено",
    standalone_assessment_update: "Обновлено",
    record_only: "Без изменений",
  },
} as const;

const LEARNING_EXCLUSION_REASON_LABELS = {
  en: {
    LOW_UX_COMPLIANCE: "Low answer-style consistency",
    INVALID_TAG_WARNINGS: "Invalid or fallback tagging quality",
    FALLBACK_GENERATION: "Fallback test generation was used",
    FALLBACK_TAGGING: "Fallback tagging was used",
    LEARNING_INELIGIBLE: "Generation quality safeguards blocked learning updates",
    DEFAULT_COLLECTION: "Topic belongs to the default collection",
    UNKNOWN: "Quality safeguards excluded this attempt",
  },
  ru: {
    LOW_UX_COMPLIANCE: "Низкая согласованность стиля ответа",
    INVALID_TAG_WARNINGS: "Низкое качество разметки задания",
    FALLBACK_GENERATION: "Тест был создан резервным способом",
    FALLBACK_TAGGING: "Разметка задания выполнена резервным способом",
    LEARNING_INELIGIBLE: "Проверки качества не допустили попытку к обновлению прогресса",
    DEFAULT_COLLECTION: "Тема находится в группе без назначения",
    UNKNOWN: "Попытка исключена проверками качества",
  },
} as const;

const ARM_LABELS = {
  en: {
    baseline: "Standard",
    predicted: "Adaptive",
    self_report: "Declared settings",
    manual_override: "Manual settings",
  },
  ru: {
    baseline: "Стандартный",
    predicted: "Адаптивный",
    self_report: "Заявленные настройки",
    manual_override: "Ручные настройки",
  },
} as const;

const ERROR_MESSAGES = {
  en: {
    AUTH_REQUIRED: "Please sign in again.",
    CONFLICT: "This item already exists.",
    DB_UNAVAILABLE: "The database is unavailable. Try again later.",
    EMAIL_TAKEN: "This email is already used by another account.",
    EPISODE_NOT_FOUND: "Episode not found.",
    EPISODE_SECTION_NOT_FOUND: "Section not found.",
    EPISODE_SUBJECT_NOT_FOUND: "Topic not found.",
    FORBIDDEN: "Access denied.",
    INTERNAL_ERROR: "Request failed. Try again later.",
    INVALID_CREDENTIALS: "Invalid email or password.",
    INVALID_INPUT: "Submitted data is invalid.",
    NOT_FOUND: "Requested item was not found.",
    UNAUTHORIZED: "Please sign in again.",
  },
  ru: {
    AUTH_REQUIRED: "Пожалуйста, войдите снова.",
    CONFLICT: "Такой объект уже существует.",
    DB_UNAVAILABLE: "База данных недоступна. Попробуйте позже.",
    EMAIL_TAKEN: "Этот email уже используется другой учётной записью.",
    EPISODE_NOT_FOUND: "Эпизод не найден.",
    EPISODE_SECTION_NOT_FOUND: "Раздел не найден.",
    EPISODE_SUBJECT_NOT_FOUND: "Тема не найдена.",
    FORBIDDEN: "Доступ запрещён.",
    INTERNAL_ERROR: "Не удалось выполнить запрос. Попробуйте позже.",
    INVALID_CREDENTIALS: "Неверный email или пароль.",
    INVALID_INPUT: "Отправлены некорректные данные.",
    NOT_FOUND: "Запрошенный объект не найден.",
    UNAUTHORIZED: "Пожалуйста, войдите снова.",
  },
} as const;

const enMessages = {
  common: {
    actualAccuracy: "Actual accuracy",
    actualTime: "Actual time",
    adaptiveState: "Adaptive state",
    allTopics: "All topics",
    cancel: "Cancel",
    confidenceShort: "conf",
    confirm: "Confirm",
    disabled: "Disabled",
    eligible: "Eligible",
    excluded: "Excluded",
    expectedTotalDuration: "Expected total duration",
    granted: "Granted",
    growing: "Growing",
    loading: "Loading...",
    low: "Low",
    medium: "Medium",
    high: "High",
    na: "n/a",
    no: "No",
    noDataYet: "No data yet",
    noDescriptionYet: "No description yet.",
    noParent: "No parent",
    noSection: "No section",
    none: "None",
    notEnoughDataYet: "Not enough data yet",
    notGranted: "Not granted",
    notRecorded: "Not recorded",
    notSet: "Not set",
    notWithdrawn: "Not withdrawn",
    openAnalytics: "Open analytics",
    openPractice: "Open practice",
    openTopics: "Open topics",
    pathway: "Path",
    ready: "Ready",
    recordedAttempt: "Saved attempt",
    recordedAttempts: "Saved attempts",
    resultContract: "Attempt record",
    save: "Save",
    saving: "Saving...",
    sec: "sec",
    sectionOptional: "Section (optional)",
    selectTopic: "Select a topic",
    source: "Generation path",
    stateUnchanged: "Unchanged",
    stateUpdated: "Updated",
    unknown: "Unknown",
    whyExcluded: "Why excluded",
    questions: "questions",
    yes: "Yes",
    learningUpdates: "Progress updates",
  },
  localeSwitcher: {
    ariaLabel: "UI language",
    en: "EN",
    ru: "RU",
  },
  shell: {
    operator: "Operator",
    title: "Learning Workspace",
    nav: {
      analytics: "Analytics",
      learn: "Learn",
      practice: "Practice",
      profile: "Profile",
      topics: "Topics",
    },
  },
  authActions: {
    createAccount: "Create account",
    signIn: "Sign in",
    signOut: "Sign out",
    simulatedAccount: "Simulated account",
    userFallback: "User",
  },
  authGate: {
    adminRedirect: "Admin access required. Redirecting...",
    checkingAccess: "Checking access...",
    signInRedirect: "Redirecting to sign in...",
  },
  home: {
    heroBody:
      "EduAI now runs a structured learner episode with precheck, learning content, postcheck, and holdout in one flow. Tests remain the main evidence; the explanation step supports the episode.",
    heroTitle: "One learning episode. End to end.",
    startEpisode: "Start episode",
    transparencyItems: [
      "Expected accuracy and time are shown as heuristic proxies.",
      "Confidence increases only with enough high-quality samples.",
      "Adaptive decisions may still rely on baseline support depending on the active backend.",
      "Admin observability tracks quality, calibration, and drift.",
    ],
    transparencyTitle: "How it stays transparent",
  },
  statusPanel: {
    completedChecks: "Completed checks",
    expectedAccuracy: "Expected accuracy",
    learningEligibleChecks: "Learning-ready checks",
    personalization: "Personalization",
    recordedAttempts: "Recorded attempts",
    title: "Status",
  },
  login: {
    createAccount: "Create account",
    email: "Email",
    errorFallback: "Sign in failed.",
    loading: "Signing in...",
    noAccount: "No account yet?",
    password: "Password",
    submit: "Sign in",
    subtitle: "Use your account email and password to access the learner workspace.",
    title: "Sign in",
  },
  register: {
    alreadyHaveAccount: "Already have an account?",
    consent:
      "I consent to anonymized use of my results (scores, durations, metadata) for research/model improvement.",
    createAccount: "Create account",
    creating: "Creating account...",
    email: "Email",
    errorFallback: "Failed to create account.",
    nameOptional: "Name (optional)",
    password: "Password",
    signIn: "Sign in",
    subtitle:
      "Create an account with email and password to use protected learning routes.",
    title: "Create account",
  },
  profile: {
    accountEditHelp:
      "Basic account editing is intentionally limited here. Email, membership history, and system data stay read-only.",
    accountAndContext: "Account and context",
    accountSaveFailed: "Failed to update account.",
    accountSaved: "Account updated.",
    accessibilityAndPresentation: "Appearance & accessibility",
    adaptiveReadiness: "Adaptive readiness",
    appearanceFontScale: "Font size",
    appearanceFontScaleHelp:
      "Scales text across the main app with one consistent app-level setting.",
    appearanceHelp:
      "These visual preferences apply across the main app immediately and persist in this browser.",
    appearanceHighContrast: "High contrast",
    appearanceHighContrastHelp:
      "Boosts text, borders, cards, and focus states for stronger readability.",
    appearanceIntro:
      "Practical visual settings for theme, reading size, and contrast. This is not a full accessibility overhaul.",
    appearanceTheme: "Theme",
    appearanceThemeHelp: "System follows your device light/dark preference.",
    contrastOff: "Off",
    contrastOn: "On",
    attempts: "Attempts",
    averageAnswerChanges: "Average answer changes",
    averageFirstAnswerTime: "Average first-answer time",
    averageTotalDuration: "Average total duration",
    consentGrantedAt: "Consent granted at",
    consentStatus: "Consent status",
    consentVersion: "Consent version",
    consentWithdrawnAt: "Consent withdrawn at",
    consentAlreadyEnabled: "Research consent is already enabled.",
    consentNotEnabled: "Research consent is not enabled.",
    createTopicFirst: "No saved settings in this group yet.",
    currentDifficultyTarget: "Current difficulty target",
    dataAndConsentBody:
      "Account name, participation dates, and research consent controls.",
    declaredPedagogy: "Declared pedagogy preferences",
    declaredPresentation: "Declared presentation preferences",
    declaredFormatPreference: "Declared format preference",
    declaredStylePreference: "Declared style preference",
    displayName: "Display name",
    displayNameHelp: "This learner-facing name is shown across the main app.",
    displayNamePlaceholder: "Enter a display name",
    email: "Email",
    engagementSignals: "Engagement signals",
    errorLoad: "Failed to load profile.",
    evidenceQuality: "Evidence quality",
    exclusionReason: "Exclusion reason",
    excludedAttempts: "Excluded attempts",
    fontScale100: "100%",
    fontScale110: "110%",
    fontScale125: "125%",
    fontScale140: "140%",
    futureTrainingEligibility: "Future training eligibility",
    interfaceSettingsBody:
      "Theme, text size, and contrast settings stored in this browser.",
    learningEligibleShare: "Learning-eligible share",
    lastUpdated: "Last updated",
    lightTheme: "Light",
    loadingProfile: "Loading profile...",
    loadingProfileBody:
      "Once the profile loads, you can review settings, progress signals, and consent controls here.",
    limitationsTitle: "Notes and limitations",
    memberSince: "Member since",
    name: "Name",
    nextDifficultySuggestion: "Next difficulty suggestion",
    noAccountChanges: "No account changes to save.",
    noExcludedAttempts: "No excluded attempts yet.",
    noPreferenceChanges: "No preference changes to save.",
    notesTitle: "Notes and limitations",
    openAnalytics: "Open analytics",
    openLearn: "Open learn",
    openPractice: "Open practice",
    perTopicSummary: "Per-topic summary",
    practiceFormat: "Practice format",
    practiceFormatFallback: "MCQ only in current contour",
    myPreferencesBody:
      "Your declared learning preferences. They stay separate from system estimates.",
    personalizationBody:
      "Read-only adaptation summary from current learning data.",
    personalizationDetails: "Detailed personalization signals",
    personalizationDetailsBody:
      "These read-only details show what the system currently observes from saved attempts. They do not overwrite declared preferences.",
    preferencesHelp:
      "Saving here updates only the declared layer. System observations remain read-only in the System tab.",
    preferencesIntro:
      "These are your declared preferences. They stay editable and separate from system observations.",
    preferencesSaveFailed: "Failed to update declared preferences.",
    preferencesSaved: "Declared preferences updated.",
    preferredDifficulty: "Preferred difficulty",
    preferredDifficultyHelp:
      "Self-reported target for structured practice when the self-report path is used.",
    preferredExplanationStyle: "Preferred explanation style",
    preferredExplanationStyleHelp:
      "How you want explanations phrased when declared preferences are used.",
    preferredDepth: "Preferred explanation depth",
    preferredDepthHelp:
      "Explicit declared depth preference. If unset, style may still imply depth in the current self-report bridge.",
    preferredTone: "Preferred tone",
    preferredToneHelp:
      "Presentation preference only. It does not rewrite the system observation layer.",
    recentAccuracy: "Recent accuracy",
    researchConsentAndTrainingEligibility:
      "Research consent and training eligibility",
    researchConsentDisabled:
      "Research consent withdrawn. Future training/export eligibility is now disabled.",
    researchConsentEnabled:
      "Research consent enabled for future training/export eligibility.",
    researchConsentFailure: "Failed to update research consent.",
    saveAccount: "Save account",
    saveConsent: "Enable research consent",
    savePreferences: "Save preferences",
    savedPreferences: "Saved declared preferences",
    savingConsent: "Saving...",
    savingAccount: "Saving account...",
    savingPreferences: "Saving preferences...",
    structuredAttempts: "Recorded attempts",
    subtitle:
      "Declared preferences stay separate from system observations. Analytics and recommendation evidence remain visible without silently overwriting what you set.",
    systemConfidence: "System confidence",
    systemCurrentDepthTarget: "Current explanation depth target",
    systemReadOnly:
      "Read-only system observations based on evidence and current runtime policy. These do not overwrite your declared preferences.",
    systemSummary: "Current system summary",
    systemTheme: "System",
    systemObservations: "System observations and inferred preferences",
    tabAccessibility: "Interface settings",
    tabAccount: "Data and consent",
    tabPreferences: "My preferences",
    tabSystem: "Personalization",
    targetBand: "Target band",
    title: "Profile and learning settings",
    topicLearningHistory: "Topic learning history",
    topicLearningHistoryBody:
      "A per-topic view of saved attempts, progress-eligible attempts, exclusions, and the current difficulty target.",
    topExclusions: "Top exclusions",
    totalAttempts: "Recorded attempts",
    unavailable: "Profile unavailable.",
    unavailableNextStep:
      "Try opening Learn or refresh this page after the profile data is available.",
    noPreference: "No preference",
    darkTheme: "Dark",
    withdrawConsent: "Withdraw research consent",
    withdrawConsentNote:
      "Withdrawing consent does not erase operational history. It excludes future training/export use going forward.",
  },
  practice: {
    addTopicFirst: "Add a topic first",
    buildCustomSet: "Create quick practice",
    choosePath: "Quick practice",
    coreBody:
      "A learning episode is the main personalized learning path and the strongest source of structured learning evidence.",
    coreLabel: "Main path",
    coreTitle: "Full learning episode",
    customBody:
      "Build a direct practice set for a chosen topic, section, and question count. This path is secondary and does not replace the coordinated Learn loop.",
    customLabel: "Secondary path",
    customTitle: "Quick practice",
    disabledNeedTopic: "Choose a topic before creating practice. If you do not have topics yet, create one first.",
    expectedAccuracy: "Expected accuracy",
    expectedTime: "Expected time",
    failedGenerate: "Failed to generate practice set.",
    formBody:
      "Choose a topic and question count. This creates one standalone practice set for quick reinforcement.",
    fullEpisodeCta: "Better start a full episode",
    generating: "Generating...",
    generationErrorNextStep:
      "Check the selected topic and try again, or start a full learning episode instead.",
    learnVsPracticeTitle: "Learn vs Practice",
    mode: "Mode",
    nextDifficulty: "Suggested difficulty next",
    noTopicsTitle: "Create a topic before practice",
    noTopicsBody: "Add a topic in Topics before creating quick practice.",
    openCorePractice: "Open Learn",
    optionalHints: "Optional practice guidance",
    practiceFocus: "Practice focus",
    practiceMode: "Practice mode",
    personalized: "Personalized",
    placeholderTopic: "For example: Solving linear equations",
    primaryCta: "Create quick practice",
    questionCount: "Question count",
    quickPracticeBody:
      "Practice is a fast standalone test or reinforcement step. It helps you review material, but it does not replace the full learning episode.",
    quickPracticeTitle: "Quick practice",
    quickTitle: "Create quick practice",
    recommendationConfidence: "Confidence",
    recommendationPlaceholder: "Not enough data yet",
    recommendedSettings: "Recommended settings",
    selectTopicFirst: "Select a topic first.",
    startSet: "Start practice set",
    standard: "Standard",
    subtopicOptional: "Subtopic (optional)",
    subtitle:
      "Use Practice for a quick separate test or reinforcement. For the main personalized learning path, start a full learning episode in Learn.",
    topic: "Topic",
  },
  learn: {
    acknowledgeSource:
      "Tests remain the primary evidence of learning gain.",
    activeEpisode: "Active episode",
    adaptive: "Adaptive",
    adaptiveBody:
      "Adaptive mode uses current learner evidence and active policy boundaries for difficulty and explanation depth.",
    adaptiveTitle: "Adaptive path",
    addTopicBeforeLearn:
      "Add and organize a topic in Topics before starting Learn.",
    answered: "Answered",
    answerAllQuestions:
      "Complete all questions to record this evaluation step.",
    arm: "Path",
    chooseTopicAndFocus: "Choose a topic and lesson focus first.",
    completedOutcomes: "Completed outcomes",
    continueEpisode: "Continue episode",
    continueToNextTest: "Continue to next test",
    continueToOpen: "Open next step",
    continuing: "Continuing...",
    currentTopic: "Current focus",
    created: "Created",
    dataQualityGate: "data quality gate",
    depthSetting: "Depth",
    delayedRecheckNotDue: "Delayed recheck is not due yet",
    dialogueEmptyBody:
      "Ask an educational question about this topic, request a clarification, or continue the explanation before moving to the next check.",
    dialogueEmptyTitle: "The dialogue starts with your question",
    dialogueInputLabel: "Ask about this topic",
    dialogueInputPlaceholder:
      "For example: Can you explain this step in a simpler way?",
    dialogueLearnerLabel: "You",
    dialogueLimitReached:
      "This episode step has reached its dialogue limit. Continue to the next check to keep the learning loop moving.",
    dialogueScopedNote:
      "Educational topic only. The dialogue stays attached to this episode and supports the next check.",
    dialogueSend: "Send question",
    dialogueSending: "Generating reply...",
    dialogueStarterExample: "Give me a step-by-step example for {topic}",
    dialogueStarterExplain: "Explain the core idea of {topic}",
    dialogueStarterFocus: "What should I focus on before the next check in {topic}?",
    dialogueSubtitle:
      "Use the episode plan and ask follow-up questions in the same learning context.",
    dialogueSystemLabel: "EduAI",
    dialogueTitle: "Learning dialogue",
    dialogueTurnsRemaining: "{count} questions left",
    difficultySetting: "Difficulty",
    episodeMode: "Episode mode:",
    errorContinue: "Unable to continue episode.",
    errorDialogueReply: "Unable to generate dialogue reply.",
    errorNextStep:
      "Check the selected topic, then try again or return to Topics.",
    errorStart: "Unable to start episode.",
    errorSubmit: "Unable to submit step.",
    evidenceBody:
      "Scored checks remain the primary learning signal. A recorded check can update learner progress only when quality checks allow it; the dialogue step is supporting context inside the episode.",
    evidenceTitle: "How evidence works",
    educationalOnly: "Educational support only. Stay on the current topic.",
    guideTitle: "Episode plan",
    holdoutEnabled: "Final check included",
    learningContentCount: "Learning content",
    learningEpisodeFallback: "Learning episode",
    lessonFocus: "Lesson focus",
    loadingTopics: "Loading topics...",
    noSection: "No section",
    openPractice: "Open Practice",
    placeholderTopic: "For example: Linear equations",
    practiceAlignmentBody:
      "Learn stays canonical for the full episode loop. Practice remains available for a direct practice set without replacing the episode-first path.",
    practiceAlignmentTitle: "Practice alignment",
    previousRecorded:
      "The previous step is recorded. Open the next episode step when you are ready.",
    primaryLearningSignal: "primary learning signal",
    question: "Question",
    restoreEpisode: "Restoring learner episode...",
    restoreEpisodeBody:
      "EduAI is checking whether you have an unfinished episode. If none is found, you can start a new one here.",
    secondarySupportingStep: "secondary supporting step",
    sourceFallback: "reserve generation path",
    sourceLlm: "generated guide",
    startAnotherEpisode: "Start another episode",
    startButton: "Start episode",
    startWithExplanation: "Start with explanation",
    startLoading: "Starting episode...",
    startNewEpisode: "Start a new episode",
    startNewEpisodeBody:
      "Pick a topic and lesson focus. EduAI will create one episode with an initial check, learning step, follow-up check, and final check.",
    statusAfter:
      "Come back after {date} to continue this episode.",
    stepContinueLoading: "Loading...",
    structuredEpisode: "Structured learning episode",
    structuredEpisodeBody:
      "Start one coordinated episode with an initial check, a learning step, a follow-up check, and a final check in the same flow.",
    styleSetting: "Style and tone",
    submissionDefault: "Test outcome recorded.",
    submissionHoldout: "Final check recorded. The episode can now close cleanly.",
    submissionPostcheck:
      "Postcheck recorded. Continue to the next evaluation step if it exists.",
    submissionPrecheck:
      "Precheck recorded. Continue into the instructional step.",
    submissionUpdates:
      "Submitting always records this step. It contributes to learner progress only when quality checks allow it.",
    submissionUpdatesHoldout:
      "The final check stays part of the same episode. It is always recorded, but learner-progress updates still depend on quality checks.",
    submit: "Submit step",
    submitting: "Submitting...",
    summaryOutcomeRecorded: "Outcome recorded",
    summaryPredictionVsActual: "Prediction vs actual",
    summaryRuntimeNote: "Next-step note",
    summaryScore: "Score",
    testItems: "Test items",
    title: "Learn",
    topic: "Topic",
    topicFallback: "Unknown topic",
    topicPromptTitle: "Need a topic first?",
    topicPromptBody:
      "Open Topics to create a topic group and add a topic before starting Learn.",
    topicPromptNote:
      "Topics left in Unassigned stay out of analytics, so organize them in Topics before relying on Analytics.",
    upcomingCurrent: "current",
    upcomingDone: "done",
    upcomingNext: "up next",
    whatLearnerWillSee: "What the learner will see",
    whatLearnerWillSeeItems: [
      "Precheck test to measure the starting point.",
      "Dedicated learning-content step inside the same episode.",
      "Follow-up and final checks to record outcome quality.",
      "A clear completion state with recorded results.",
    ],
    waitingDelay: "Waiting delay",
    completedTitle: "The learning episode is complete",
    completedBody:
      "The episode result is recorded and ready for progress review.",
    completedBanner: "Episode completed",
    reflectionPrompt: "Reflection prompt",
    nextDifficulty: "Next difficulty",
    moreEvidenceBeforeDifficultyChange:
      "More evidence is needed before changing difficulty.",
    resumeNoticeBody:
      "EduAI restored it automatically. Continue this episode or start a new one intentionally from here.",
    resumeNoticeTitle: "Unfinished episode found",
    continueRestoredEpisode: "Continue",
    startNewInstead: "Start new",
    contentDetails: "Generation details",
    createFirstTopic: "Create first topic",
    noTopicsTitle: "Create your first topic",
    noTopicsBody:
      "First create a topic, then start the first learning episode.",
    noTopicsHelp:
      "The learning episode needs a topic so evidence, recommendations, and analytics stay attached to the right scope.",
    excludedFromLearningUpdates: "Not used for learner-progress updates:",
    addTopicInTopicsFirst: "Add a topic in Topics first",
  },
  analytics: {
    currentScopeSummary: "Current scope summary",
    emptyBody:
      "Complete your first learning episode to unlock trend and consistency metrics.",
    emptyTitle: "No data yet",
    errorFallback: "Failed to load analytics.",
    errorNextStep:
      "Open Learn to continue the learning flow, or try Analytics again after a new attempt is saved.",
    errorProfileSummary: "Failed to load profile summary.",
    evidenceRecentAttempts: "recent attempts",
    evidenceForecastFallback: "forecast fallback",
    loading: "Loading analytics...",
    loadingBody:
      "EduAI is preparing the next step and progress summary for this view.",
    moreViews: "More views",
    moreViewsBody:
      "Analytics stays read-only and keeps heuristic/runtime uncertainty visible.",
    moreViewsCards: [
      "Forecasts are operational guidance, not proof of causal learning gain.",
      "Confidence rises only when enough structured attempts accumulate.",
      "Canonical topic structure remains the anchor for aggregation and recommendations.",
    ],
    nextStepTitle: "Next recommended step",
    nextStepDataTitle: "Not enough data - complete a learning episode",
    nextStepDataBody:
      "EduAI needs a full learning episode before progress patterns become reliable.",
    nextStepWeakTitle: "Continue learning on {topic}",
    nextStepWeakBody:
      "Recent results suggest this topic still needs a full learning pass before relying on quick practice.",
    nextStepPracticeTitle: "Reinforce the material with practice",
    nextStepPracticeBody:
      "Recent results vary enough that a short practice set can help stabilize recall.",
    nextStepFallbackTitle: "Continue learning to collect data",
    nextStepFallbackBody:
      "There is not enough reliable signal to choose a narrower action yet.",
    nextStepLearnCta: "Start learning episode",
    nextStepPracticeCta: "Create quick practice",
    readOnlyPill: "Read-only analytics view",
    startFirstEpisode: "Start first episode",
    subtitle:
      "Forecasts, confidence, recent evidence, and recommendation context in one learner-facing view.",
    title: "Analytics for learning progress and next-step readiness",
    topicFocus: "Topic focus",
    noAttemptsIllustration: "No attempts illustration",
  },
  dashboard: {
    difficulty: {
      currentTarget: "Current target",
      noRecentChange: "No recent difficulty change inferred from stored attempts.",
      recentlyChanged: "Recently changed.",
      reasonCooldown: "Difficulty cooldown prevented immediate change.",
      reasonDecrease: "Recent accuracy was below target band.",
      reasonIncrease: "Recent accuracy was above target band.",
      reasonFallback: "Recorded reason: {reason}",
      reasonLowN: "Not enough clean attempts yet.",
      reasonMissing: "Reason was not logged.",
      reasonWithinBand: "Recent accuracy was inside target band.",
      title: "Difficulty status",
    },
    consistency: {
      accuracyHelp:
        "Average absolute difference between predicted and actual accuracy.",
      durationDeviation: "Duration deviation",
      durationHelp:
        "Average absolute difference between predicted and actual completion time.",
      meanAbsoluteError: "Mean absolute error (accuracy)",
      samples: "Samples",
      title: "Consistency (last 10 tests)",
      whatIsThis: "What is this?",
    },
    forecast: {
      accuracyHelper: "heuristic proxy",
      body: "Based on your recent attempts and answered questions.",
      expectedAccuracy: "Expected accuracy",
      expectedDuration: "Expected duration",
      noData: "No data yet",
      rangeHelper: "range widens when confidence is low",
      startEpisode: "Start episode",
      title: "Forecast before you press start",
      eyebrow: "Next test forecast",
    },
    mastery: {
      evidence: "Evidence",
      estimatedMastery: "Estimated mastery",
      lastActivity: "Last activity",
      noActivity: "No activity yet",
      noData: "No data yet",
      title: "Mastery summary",
    },
    trend: {
      actual: "Actual",
      ariaLabel: "Accuracy trend chart",
      noAttempts:
        "No attempts yet. Finish a learning episode to see trend lines.",
      predicted: "Predicted",
      predictedMissing:
        "Predicted accuracy is unavailable in recent logs; showing actual trend only.",
      title: "Trend (last 10 attempts)",
      titleEmpty: "Trend (last attempts)",
    },
  },
  topics: {
    addTopicGroup: "Create topic group",
    addTopicGroupFirst:
      "Create a topic group first if this topic should appear in analytics.",
    archive: "Archive",
    archiveTopic: "Archive topic?",
    backToTopics: "Back to topics",
    createTopic: "Create topic",
    createTopicGroup: "Create topic group",
    creating: "Creating...",
    default: "Default",
    delete: "Delete",
    deleteTopicGroup: "Delete topic group?",
    description: "Description",
    errorCreateGroup: "Failed to create topic group.",
    errorCreateTopic: "Failed to create topic.",
    errorLoad: "Failed to load topics.",
    errorAction: "Unable to update topics.",
    errorNextStep: "Try again, or create a topic after the list is available.",
    emptyTitle: "No topics yet",
    emptyBody:
      "First create a topic, then start the first learning episode.",
    createFirstTopic: "Create first topic",
    manageGroupsSecondary:
      "Topic groups are optional organization. Create a topic first, then group it if needed.",
    actionRenameGroupTitle: "Rename topic group",
    actionDeleteGroupTitle: "Delete topic group",
    actionRenameTopicTitle: "Rename topic",
    actionArchiveTopicTitle: "Archive topic",
    confirmDeleteTopicGroupBody:
      "This will delete the topic group “{name}”. Topics are not deleted by this dialog; review the topic list afterward if this group was used for organization.",
    confirmArchiveTopicBody:
      "This will archive “{title}” and remove it from normal learner selection.",
    saveChanges: "Save changes",
    confirmArchive: "Archive topic",
    confirmDelete: "Delete",
    loading: "Loading topics...",
    loadingBody:
      "Once topics load, you can create a topic or start a learning episode from an existing one.",
    name: "Name",
    newTopicGroupName: "New topic group name",
    newTopicTitle: "New topic title",
    openTopics: "Open topics",
    parent: "Parent",
    rename: "Rename",
    startEpisode: "Start episode",
    subtitle:
      "Topics stay canonical for learner analytics, recommendations, and episode scope. Personal topic groups remain an overlay, not a replacement for the core structure.",
    title: "Canonical topic structure",
    topic: "Topic",
    topicGroup: "Topic group",
    topicGroupAndTopics: "Topic groups and topics",
    topicGroupsNote:
      "Topics in the “Unassigned” group are excluded from analytics.",
    topicGroupLabel: "Topic group",
    topicGroupNameDefault: "Unassigned",
    topicTitle: "Title",
    unassignedLabel: "Unassigned topics",
    unassignedOption: "Unassigned (excluded from analytics)",
  },
  topicDetails: {
    addSection: "Add section",
    addSubtopic: "Add subtopic",
    averageAccuracy: "Average accuracy",
    delete: "Delete",
    deleteSection: "Delete section?",
    descriptionOptional: "Description (optional)",
    emptySubtopics: "No subtopics yet.",
    emptySubtopicsBody:
      "Add a subtopic to focus future learning episodes and quick practice more precisely.",
    errorLoad: "Failed to load topic.",
    errorAction: "Unable to update topic structure.",
    errorNextStep: "Return to Topics and choose another topic or try again.",
    loading: "Loading topic...",
    loadingBody:
      "Once the topic loads, you can start an episode, review recent attempts, or organize subtopics.",
    moveDown: "Move down",
    moveUp: "Move up",
    newSectionTitle: "New section title",
    noAttempts: "No attempts yet.",
    noAttemptsBody:
      "Start a learning episode to create the first saved result for this topic.",
    notFound: "Topic not found.",
    noRecommendation:
      "Not enough evidence yet. Start a core episode first.",
    parentSection: "Parent section",
    practiceThisSubtopic: "Practice",
    recentAttempts: "Recent attempts",
    recommendationLoading: "Recommendation is loading...",
    recommendedEpisode: "Recommended episode",
    rename: "Rename",
    sectionPathNote:
      "Each subtopic refines scope for practice generation and later analytics.",
    startRecommendedEpisode: "Start recommended episode",
    subtopic: "Subtopic",
    structure: "Topic structure",
    actionRenameSectionTitle: "Rename subtopic",
    actionDeleteSectionTitle: "Delete subtopic",
    confirmDeleteSectionBody:
      "This will delete the subtopic “{title}” from the topic structure.",
    saveSection: "Save subtopic",
    confirmDelete: "Delete subtopic",
    thisTopicExcluded:
      "This topic belongs to the “Unassigned” group and is excluded from analytics.",
    totals: "Totals",
    totalTests: "Total tests",
  },
  testRunner: {
    actualAccuracy: "Actual accuracy",
    actualTime: "Actual time",
    answerAll: "Answer all questions to submit the test.",
    attemptRecorded: "Your attempt has been saved.",
    customPractice: "Standalone practice",
    customPracticeBody:
      "You are answering a quick practice set. EduAI saves the score, answer timing, and answer changes for this attempt. Practice can help reinforce a topic, but it does not replace the full learning episode in Learn.",
    evidenceSummaryBody:
      "The result is saved after submit. It updates learning progress only when quality checks allow it.",
    evidenceSummaryTitle: "What will be saved",
    evidenceTechnicalDetails: "Technical details",
    excludedFromLearning: "Excluded from progress updates:",
    nextSuggestion: "Next suggestion",
    nextSuggestionBody: "More evidence is needed to adjust difficulty.",
    noTagStats: "No tag statistics returned.",
    openCustomPractice: "Open practice",
    openLearnerEpisodeFlow: "Continue in Learn",
    practiceDoesNotReplaceEpisode:
      "For the main learning path, continue with a full episode in Learn.",
    predictionVsActual: "Prediction vs actual",
    question: "Question",
    score: "Score",
    submit: "Submit test",
    submitDisabledHint: "Answer all questions before submitting.",
    submitting: "Submitting...",
    suggestedNextDifficulty: "Suggested next difficulty",
  },
  adminOverview: {
    activeRuntime: "Accuracy/time prediction runtime",
    actor: "Actor",
    action: "Action",
    actionResult: "Result",
    artifactPath: "Accuracy artifact path",
    artifactPresent: "Artifact present",
    artifactSlot: "Artifact slot",
    backendKind: "Accuracy backend kind",
    checked: "Checked",
    datasetExport: "Dataset export endpoint",
    dangerousActions: "Dangerous operator actions",
    excludedUsers: "Excluded users",
    errorLoad: "Failed to load admin operational summary.",
    episodeInspection: "Episode inspection",
    evaluationExport: "Evaluation export endpoint",
    exports: "Exports and operator paths",
    futureTrainingEligible: "Future-training eligible",
    ip: "IP",
    loading: "Loading admin operational summary...",
    noActions: "No audited operator actions yet.",
    notConfigured: "Not configured",
    notReady: "Not ready",
    operationalAdmin: "Operational Admin",
    policyId: "Accuracy policy id",
    policyMode: "Policy mode",
    promptTemplates: "Prompt templates",
    rateLimiter: "Rate limiter",
    readiness: "Readiness",
    readinessChecks: "Readiness checks",
    runtimeBackend: "Accuracy runtime backend",
    runtimeArtifactStatus: "Accuracy runtime artifact status",
    runtimeIntegration: "Runtime integration",
    runtimeWarning: "Accuracy runtime warning",
    selectionSource: "Selection source",
    slotMetadataStatus: "Slot metadata status",
    slotState: "Slot state",
    subtitle:
      "Current runtime state, readiness, exports, future-training eligibility, artifact slot visibility, and dangerous operator actions.",
    consentAndTrainingEligibility: "Consent and training eligibility",
    consentGranted: "Consent granted",
    consentWithdrawn: "Consent withdrawn",
    explicitlyExcluded: "Explicitly excluded",
    systemSnapshot: "System snapshot",
    target: "Target",
    time: "Time",
    totalUsers: "Total users",
    trainingEligibleUsers: "Training-eligible users",
    unknownActor: "Unknown",
    warning: "Warning",
  },
} as const;

type DeepLocalizedMessages<T> =
  T extends string ? string
  : T extends readonly (infer U)[] ? readonly DeepLocalizedMessages<U>[]
  : T extends object ? { [K in keyof T]: DeepLocalizedMessages<T[K]> }
  : T;

export type UiMessages = DeepLocalizedMessages<typeof enMessages>;

const ruMessages: UiMessages = {
  common: {
    actualAccuracy: "Фактическая точность",
    actualTime: "Фактическое время",
    adaptiveState: "Адаптивное состояние",
    allTopics: "Все темы",
    cancel: "Отмена",
    confidenceShort: "дов.",
    confirm: "Подтвердить",
    disabled: "Отключено",
    eligible: "Допущено",
    excluded: "Исключено",
    expectedTotalDuration: "Ожидаемая общая длительность",
    granted: "Разрешено",
    growing: "Растёт",
    loading: "Загрузка...",
    low: "Низкая",
    medium: "Средняя",
    high: "Высокая",
    na: "н/д",
    no: "Нет",
    noDataYet: "Данных пока нет",
    noDescriptionYet: "Описания пока нет.",
    noParent: "Без родителя",
    noSection: "Без раздела",
    none: "Нет",
    notEnoughDataYet: "Пока недостаточно данных",
    notGranted: "Не разрешено",
    notRecorded: "Не зафиксировано",
    notSet: "Не задано",
    notWithdrawn: "Не отозвано",
    openAnalytics: "Открыть аналитику",
    openPractice: "Открыть практику",
    openTopics: "Открыть темы",
    pathway: "Путь",
    ready: "Готово",
    recordedAttempt: "Сохранённая попытка",
    recordedAttempts: "Сохранённые попытки",
    resultContract: "Запись попытки",
    save: "Сохранить",
    saving: "Сохранение...",
    sec: "с",
    sectionOptional: "Раздел (необязательно)",
    selectTopic: "Выберите тему",
    source: "Путь генерации",
    stateUnchanged: "Без изменений",
    stateUpdated: "Обновлено",
    unknown: "Неизвестно",
    whyExcluded: "Почему исключено",
    questions: "вопросов",
    yes: "Да",
    learningUpdates: "Обновления прогресса",
  },
  localeSwitcher: {
    ariaLabel: "Язык интерфейса",
    en: "EN",
    ru: "RU",
  },
  shell: {
    operator: "Оператор",
    title: "Учебное пространство",
    nav: {
      analytics: "Аналитика",
      learn: "Обучение",
      practice: "Практика",
      profile: "Профиль",
      topics: "Темы",
    },
  },
  authActions: {
    createAccount: "Создать аккаунт",
    signIn: "Войти",
    signOut: "Выйти",
    simulatedAccount: "Симулированный аккаунт",
    userFallback: "Пользователь",
  },
  authGate: {
    adminRedirect: "Нужен доступ администратора. Перенаправление...",
    checkingAccess: "Проверяем доступ...",
    signInRedirect: "Перенаправление на вход...",
  },
  home: {
    heroBody:
      "EduAI теперь проводит структурированный учебный эпизод с предпроверкой, учебным шагом, постпроверкой и холдаутом в одном потоке. Тесты остаются основным доказательством; шаг с объяснением поддерживает эпизод.",
    heroTitle: "Один учебный эпизод. От начала до конца.",
    startEpisode: "Начать эпизод",
    transparencyItems: [
      "Ожидаемая точность и время показываются как эвристические прокси.",
      "Уверенность растёт только при достаточном количестве качественных наблюдений.",
      "Адаптивные решения всё ещё могут опираться на baseline в зависимости от активного backend.",
      "Операторская наблюдаемость отслеживает качество, калибровку и дрейф.",
    ],
    transparencyTitle: "Как сохраняется прозрачность",
  },
  statusPanel: {
    completedChecks: "Завершённые проверки",
    expectedAccuracy: "Ожидаемая точность",
    learningEligibleChecks: "Проверки для обучения",
    personalization: "Персонализация",
    recordedAttempts: "Зафиксированные попытки",
    title: "Статус",
  },
  login: {
    createAccount: "Создать аккаунт",
    email: "Email",
    errorFallback: "Не удалось выполнить вход.",
    loading: "Входим...",
    noAccount: "Ещё нет аккаунта?",
    password: "Пароль",
    submit: "Войти",
    subtitle: "Используйте email и пароль аккаунта, чтобы открыть учебное пространство.",
    title: "Вход",
  },
  register: {
    alreadyHaveAccount: "Уже есть аккаунт?",
    consent:
      "Я согласен(на) на анонимизированное использование моих результатов (баллы, длительности, метаданные) для исследования и улучшения модели.",
    createAccount: "Создать аккаунт",
    creating: "Создаём аккаунт...",
    email: "Email",
    errorFallback: "Не удалось создать аккаунт.",
    nameOptional: "Имя (необязательно)",
    password: "Пароль",
    signIn: "Войти",
    subtitle:
      "Создайте аккаунт по email и паролю, чтобы использовать защищённые учебные маршруты.",
    title: "Создание аккаунта",
  },
  profile: {
    accountEditHelp:
      "Редактирование аккаунта здесь намеренно ограничено. Email, история участия и системные данные остаются только для чтения.",
    accountAndContext: "Аккаунт и контекст",
    accountSaveFailed: "Не удалось обновить аккаунт.",
    accountSaved: "Аккаунт обновлён.",
    accessibilityAndPresentation: "Внешний вид и доступность",
    adaptiveReadiness: "Готовность к адаптации",
    appearanceFontScale: "Размер шрифта",
    appearanceFontScaleHelp:
      "Масштабирует текст по всему основному интерфейсу через одну настройку.",
    appearanceHelp:
      "Эти визуальные настройки применяются ко всему основному приложению сразу и сохраняются в этом браузере.",
    appearanceHighContrast: "Высокая контрастность",
    appearanceHighContrastHelp:
      "Усиливает читаемость текста, границ, карточек и состояний фокуса.",
    appearanceIntro:
      "Практические визуальные настройки для темы, размера текста и контраста. Это не полная настройка доступности.",
    appearanceTheme: "Тема",
    appearanceThemeHelp: "Системная тема следует настройкам устройства.",
    contrastOff: "Выкл",
    contrastOn: "Вкл",
    attempts: "Попытки",
    averageAnswerChanges: "Среднее число смен ответа",
    averageFirstAnswerTime: "Среднее время до первого ответа",
    averageTotalDuration: "Средняя общая длительность",
    consentGrantedAt: "Согласие выдано",
    consentStatus: "Статус согласия",
    consentVersion: "Версия согласия",
    consentWithdrawnAt: "Согласие отозвано",
    consentAlreadyEnabled: "Исследовательское согласие уже включено.",
    consentNotEnabled: "Исследовательское согласие не включено.",
    createTopicFirst: "В этой группе пока нет сохранённых настроек.",
    currentDifficultyTarget: "Текущая целевая сложность",
    dataAndConsentBody:
      "Имя аккаунта, дата участия и управление исследовательским согласием.",
    declaredPedagogy: "Заявленные педагогические предпочтения",
    declaredPresentation: "Заявленные предпочтения представления",
    declaredFormatPreference: "Заявленное предпочтение формата",
    declaredStylePreference: "Заявленное предпочтение стиля",
    displayName: "Отображаемое имя",
    displayNameHelp:
      "Это имя показывается по всему основному приложению.",
    displayNamePlaceholder: "Введите отображаемое имя",
    email: "Email",
    engagementSignals: "Сигналы вовлечённости",
    errorLoad: "Не удалось загрузить профиль.",
    evidenceQuality: "Качество данных",
    exclusionReason: "Причина исключения",
    excludedAttempts: "Исключённые попытки",
    fontScale100: "100%",
    fontScale110: "110%",
    fontScale125: "125%",
    fontScale140: "140%",
    futureTrainingEligibility: "Допуск к будущему обучению",
    interfaceSettingsBody:
      "Тема оформления, размер текста и контрастность, сохранённые в этом браузере.",
    learningEligibleShare: "Доля пригодных учебных попыток",
    lastUpdated: "Последнее обновление",
    lightTheme: "Светлая",
    loadingProfile: "Загрузка профиля...",
    loadingProfileBody:
      "После загрузки здесь будут доступны настройки, сигналы прогресса и управление согласием.",
    limitationsTitle: "Заметки и ограничения",
    memberSince: "В системе с",
    name: "Имя",
    nextDifficultySuggestion: "Следующее предложение по сложности",
    noAccountChanges: "Нет изменений аккаунта для сохранения.",
    noExcludedAttempts: "Исключённых попыток пока нет.",
    noPreferenceChanges: "Нет изменений предпочтений для сохранения.",
    notesTitle: "Заметки и ограничения",
    openAnalytics: "Открыть аналитику",
    openLearn: "Открыть обучение",
    openPractice: "Открыть практику",
    perTopicSummary: "Сводка по темам",
    practiceFormat: "Формат практики",
    practiceFormatFallback: "Только выбор ответа в текущем контуре",
    myPreferencesBody:
      "Ваши заявленные учебные предпочтения. Они отделены от системных оценок.",
    personalizationBody:
      "Сводка адаптации только для чтения на основе текущих учебных данных.",
    personalizationDetails: "Подробные сигналы персонализации",
    personalizationDetailsBody:
      "Эти данные только для чтения показывают текущие системные наблюдения по сохранённым попыткам. Они не перезаписывают заявленные предпочтения.",
    preferencesHelp:
      "Сохранение здесь обновляет только заявленный слой. Системные наблюдения остаются только для чтения в разделе «Персонализация».",
    preferencesIntro:
      "Это ваши заявленные предпочтения. Они остаются редактируемыми и отделёнными от системных наблюдений.",
    preferencesSaveFailed:
      "Не удалось обновить заявленные предпочтения.",
    preferencesSaved: "Заявленные предпочтения обновлены.",
    preferredDifficulty: "Предпочитаемая сложность",
    preferredDifficultyHelp:
      "Желаемый уровень для учебных заданий, когда используются ваши заявленные настройки.",
    preferredExplanationStyle: "Предпочитаемый стиль объяснения",
    preferredExplanationStyleHelp:
      "Как именно вы хотите получать объяснения, когда используются заявленные предпочтения.",
    preferredDepth: "Предпочитаемая глубина объяснения",
    preferredDepthHelp:
      "Насколько подробно вы хотите получать объяснения.",
    preferredTone: "Предпочитаемый тон",
    preferredToneHelp:
      "Это настройка подачи материала. Она не перезаписывает системные наблюдения.",
    recentAccuracy: "Недавняя точность",
    researchConsentAndTrainingEligibility:
      "Исследовательское согласие и допуск к обучению",
    researchConsentDisabled:
      "Исследовательское согласие отозвано. Будущее использование для обучения и экспорта теперь отключено.",
    researchConsentEnabled:
      "Исследовательское согласие включено для будущего обучения и экспорта.",
    researchConsentFailure: "Не удалось обновить исследовательское согласие.",
    saveAccount: "Сохранить аккаунт",
    saveConsent: "Включить исследовательское согласие",
    savePreferences: "Сохранить предпочтения",
    savedPreferences: "Сохранённые заявленные предпочтения",
    savingConsent: "Сохраняем...",
    savingAccount: "Сохраняем аккаунт...",
    savingPreferences: "Сохраняем предпочтения...",
    structuredAttempts: "Зафиксированные попытки",
    subtitle:
      "Заявленные предпочтения остаются отделены от системных наблюдений. Аналитика и основания рекомендаций остаются видимыми и не перезаписывают ваши настройки скрыто.",
    systemConfidence: "Уверенность системы",
    systemCurrentDepthTarget: "Текущая целевая глубина объяснения",
    systemReadOnly:
      "Системные наблюдения здесь только для чтения. Они основаны на учебных данных и не перезаписывают ваши заявленные предпочтения.",
    systemSummary: "Текущая системная сводка",
    systemTheme: "Системная",
    systemObservations: "Системные наблюдения и выведенные предпочтения",
    tabAccessibility: "Настройки интерфейса",
    tabAccount: "Данные и согласие",
    tabPreferences: "Мои предпочтения",
    tabSystem: "Персонализация",
    targetBand: "Целевой диапазон",
    title: "Профиль и учебные настройки",
    topicLearningHistory: "Учебная история по темам",
    topicLearningHistoryBody:
      "По каждой теме показаны сохранённые попытки, попытки для обновления прогресса, исключения и текущая цель по сложности.",
    topExclusions: "Основные исключения",
    totalAttempts: "Зафиксированные попытки",
    unavailable: "Профиль недоступен.",
    unavailableNextStep:
      "Откройте обучение или обновите страницу, когда данные профиля будут доступны.",
    noPreference: "Без предпочтения",
    darkTheme: "Тёмная",
    withdrawConsent: "Отозвать исследовательское согласие",
    withdrawConsentNote:
      "Отзыв согласия не стирает рабочую историю. Он отключает дальнейшее использование для обучения и экспорта.",
  },
  practice: {
    addTopicFirst: "Сначала добавьте тему",
    buildCustomSet: "Создать быструю практику",
    choosePath: "Быстрая практика",
    coreBody:
      "Учебный эпизод - основной путь персонализированного обучения и самый сильный источник структурированных учебных данных.",
    coreLabel: "Основной путь",
    coreTitle: "Полный учебный эпизод",
    customBody:
      "Соберите прямой набор практики для выбранной темы, раздела и числа вопросов. Этот путь вторичен и не заменяет координированный цикл обучения.",
    customLabel: "Вторичный путь",
    customTitle: "Быстрая практика",
    disabledNeedTopic: "Выберите тему перед созданием практики. Если тем ещё нет, сначала создайте тему.",
    expectedAccuracy: "Ожидаемая точность",
    expectedTime: "Ожидаемое время",
    failedGenerate: "Не удалось сгенерировать набор практики.",
    formBody:
      "Выберите тему и количество вопросов. EduAI создаст отдельный набор заданий для быстрого закрепления.",
    fullEpisodeCta: "Лучше пройти полный учебный эпизод",
    generating: "Генерируем...",
    generationErrorNextStep:
      "Проверьте выбранную тему и попробуйте снова или начните полный учебный эпизод.",
    learnVsPracticeTitle: "Обучение и практика",
    mode: "Режим",
    nextDifficulty: "Следующая рекомендуемая сложность",
    noTopicsTitle: "Создайте тему перед практикой",
    noTopicsBody: "Добавьте тему в разделе «Темы» перед созданием быстрой практики.",
    openCorePractice: "Открыть обучение",
    optionalHints: "Дополнительные подсказки для практики",
    practiceFocus: "Фокус практики",
    practiceMode: "Режим практики",
    personalized: "Персонализированный",
    placeholderTopic: "Например: Решение линейных уравнений",
    primaryCta: "Создать быструю практику",
    questionCount: "Количество вопросов",
    quickPracticeBody:
      "Практика - это быстрый отдельный тест или закрепление. Она помогает повторить материал, но не заменяет полный учебный эпизод.",
    quickPracticeTitle: "Быстрая практика",
    quickTitle: "Создать быструю практику",
    recommendationConfidence: "Уверенность",
    recommendationPlaceholder: "Пока недостаточно данных",
    recommendedSettings: "Рекомендуемые настройки",
    selectTopicFirst: "Сначала выберите тему.",
    startSet: "Начать набор практики",
    standard: "Стандартный",
    subtopicOptional: "Подтема (необязательно)",
    subtitle:
      "Используйте практику для быстрого отдельного теста или закрепления. Для основного персонализированного пути запустите полный учебный эпизод в обучении.",
    topic: "Тема",
  },
  learn: {
    acknowledgeSource:
      "Тесты остаются основным подтверждением учебного прироста.",
    activeEpisode: "Активный эпизод",
    adaptive: "Адаптивный",
    adaptiveBody:
      "Адаптивный режим использует текущие учебные данные и активные границы политики для выбора сложности и глубины объяснения.",
    adaptiveTitle: "Адаптивный путь",
    addTopicBeforeLearn:
      "Добавьте и организуйте тему в разделе «Темы» перед запуском обучения.",
    answered: "Отвечено",
    answerAllQuestions:
      "Ответьте на все вопросы, чтобы зафиксировать этот шаг оценки.",
    arm: "Путь",
    chooseTopicAndFocus: "Сначала выберите тему и фокус урока.",
    completedOutcomes: "Завершённые результаты",
    continueEpisode: "Продолжить эпизод",
    continueToNextTest: "Перейти к следующему тесту",
    continueToOpen: "Открыть следующий шаг",
    continuing: "Продолжаем...",
    currentTopic: "Текущий фокус",
    created: "Создан",
    dataQualityGate: "шлюз качества данных",
    depthSetting: "Глубина",
    delayedRecheckNotDue: "Отложенная перепроверка ещё не наступила",
    dialogueEmptyBody:
      "Задайте учебный вопрос по этой теме, попросите уточнение или продолжите объяснение перед следующей проверкой.",
    dialogueEmptyTitle: "Диалог начинается с вашего вопроса",
    dialogueInputLabel: "Спросить по этой теме",
    dialogueInputPlaceholder:
      "Например: Можешь объяснить этот шаг более простым способом?",
    dialogueLearnerLabel: "Вы",
    dialogueLimitReached:
      "Для этого шага эпизода достигнут лимит диалога. Переходите к следующей проверке, чтобы сохранить движение учебного цикла.",
    dialogueScopedNote:
      "Только учебная тема. Диалог остаётся привязанным к этому эпизоду и поддерживает следующую проверку.",
    dialogueSend: "Отправить вопрос",
    dialogueSending: "Генерируем ответ...",
    dialogueStarterExample: "Покажи пошаговый пример для {topic}",
    dialogueStarterExplain: "Объясни основную идею темы {topic}",
    dialogueStarterFocus:
      "На чём мне сосредоточиться перед следующей проверкой по теме {topic}?",
    dialogueSubtitle:
      "Используйте план эпизода и задавайте уточняющие вопросы в том же учебном контексте.",
    dialogueSystemLabel: "EduAI",
    dialogueTitle: "Учебный диалог",
    dialogueTurnsRemaining: "Осталось вопросов: {count}",
    difficultySetting: "Сложность",
    episodeMode: "Режим эпизода:",
    errorContinue: "Не удалось продолжить эпизод.",
    errorDialogueReply: "Не удалось сгенерировать ответ в диалоге.",
    errorNextStep:
      "Проверьте выбранную тему, затем попробуйте снова или вернитесь в раздел «Темы».",
    errorStart: "Не удалось запустить эпизод.",
    errorSubmit: "Не удалось отправить шаг.",
    evidenceBody:
      "Оцениваемые проверки остаются основным учебным сигналом. Зафиксированная проверка может обновить учебный прогресс только если проходит проверки качества; диалог внутри эпизода остаётся поддерживающим контекстом.",
    evidenceTitle: "Как записывается результат",
    educationalOnly: "Только учебная поддержка. Оставайтесь в текущей теме.",
    guideTitle: "План эпизода",
    holdoutEnabled: "Итоговая проверка включена",
    learningContentCount: "Учебный контент",
    learningEpisodeFallback: "Учебный эпизод",
    lessonFocus: "Фокус урока",
    loadingTopics: "Загрузка тем...",
    noSection: "Без раздела",
    openPractice: "Открыть практику",
    placeholderTopic: "Например: Линейные уравнения",
    practiceAlignmentBody:
      "Обучение остаётся каноническим для полного цикла эпизода. Практика доступна для прямого набора заданий, но не заменяет путь через учебный эпизод.",
    practiceAlignmentTitle: "Связь с практикой",
    previousRecorded:
      "Предыдущий шаг зафиксирован. Откройте следующий шаг эпизода, когда будете готовы.",
    primaryLearningSignal: "основной учебный сигнал",
    question: "Вопрос",
    restoreEpisode: "Восстанавливаем учебный эпизод...",
    restoreEpisodeBody:
      "EduAI проверяет, есть ли незавершённый эпизод. Если его нет, здесь можно начать новый.",
    secondarySupportingStep: "вторичный поддерживающий шаг",
    sourceFallback: "резервный путь генерации",
    sourceLlm: "сгенерированный план",
    startAnotherEpisode: "Начать другой эпизод",
    startButton: "Начать эпизод",
    startWithExplanation: "Начать с объяснения",
    startLoading: "Запускаем эпизод...",
    startNewEpisode: "Начать новый эпизод",
    startNewEpisodeBody:
      "Выберите тему и фокус урока. EduAI создаст один эпизод с начальной проверкой, учебным шагом, повторной проверкой и итоговой проверкой.",
    statusAfter:
      "Вернитесь после {date}, чтобы продолжить этот эпизод.",
    stepContinueLoading: "Загрузка...",
    structuredEpisode: "Структурированный учебный эпизод",
    structuredEpisodeBody:
      "Запустите один координированный эпизод с начальной проверкой, учебным шагом, повторной проверкой и итоговой проверкой в одном потоке.",
    styleSetting: "Стиль и тон",
    submissionDefault: "Результат теста зафиксирован.",
    submissionHoldout: "Итоговая проверка зафиксирована. Эпизод теперь можно корректно завершить.",
    submissionPostcheck:
      "Постпроверка зафиксирована. Переходите к следующему шагу оценки, если он есть.",
    submissionPrecheck:
      "Предпроверка зафиксирована. Переходите к учебному шагу.",
    submissionUpdates:
      "Отправка всегда фиксирует этот шаг. Он влияет на учебный прогресс только если проходит проверки качества.",
    submissionUpdatesHoldout:
      "Итоговая проверка остаётся частью того же эпизода. Она всегда записывается, но обновление учебного прогресса зависит от проверок качества.",
    submit: "Отправить шаг",
    submitting: "Отправляем...",
    summaryOutcomeRecorded: "Результат зафиксирован",
    summaryPredictionVsActual: "Прогноз и факт",
    summaryRuntimeNote: "Заметка к следующему шагу",
    summaryScore: "Результат",
    testItems: "Тестовые элементы",
    title: "Обучение",
    topic: "Тема",
    topicFallback: "Неизвестная тема",
    topicPromptTitle: "Сначала нужна тема?",
    topicPromptBody:
      "Откройте «Темы», чтобы создать тему перед запуском обучения.",
    topicPromptNote:
      "Темы без назначения не попадают в аналитику, поэтому организуйте их перед использованием аналитики.",
    upcomingCurrent: "текущий",
    upcomingDone: "готово",
    upcomingNext: "дальше",
    whatLearnerWillSee: "Что увидит учащийся",
    whatLearnerWillSeeItems: [
      "Предпроверочный тест для фиксации стартовой точки.",
      "Отдельный шаг учебного контента внутри того же эпизода.",
      "Повторная и итоговая проверки для фиксации качества результата.",
      "Понятное завершение эпизода с зафиксированными результатами.",
    ],
    waitingDelay: "Пауза ожидания",
    completedTitle: "Учебный эпизод завершён",
    completedBody:
      "Результат эпизода зафиксирован и готов для просмотра прогресса.",
    completedBanner: "Эпизод завершён",
    reflectionPrompt: "Вопрос для рефлексии",
    nextDifficulty: "Следующая сложность",
    moreEvidenceBeforeDifficultyChange:
      "Нужно больше данных перед изменением сложности.",
    resumeNoticeBody:
      "EduAI восстановил его автоматически. Здесь можно продолжить этот эпизод или осознанно начать новый.",
    resumeNoticeTitle: "Незавершённый эпизод найден",
    continueRestoredEpisode: "Продолжить",
    startNewInstead: "Начать новый",
    contentDetails: "Детали генерации",
    createFirstTopic: "Создать первую тему",
    noTopicsTitle: "Создайте первую тему",
    noTopicsBody:
      "Сначала создайте тему, затем запустите первый учебный эпизод.",
    noTopicsHelp:
      "Учебному эпизоду нужна тема, чтобы данные, рекомендации и аналитика были привязаны к правильному учебному контексту.",
    excludedFromLearningUpdates: "Не использовано для обновления учебного прогресса:",
    addTopicInTopicsFirst: "Сначала добавьте тему в разделе «Темы»",
  },
  analytics: {
    currentScopeSummary: "Сводка по текущему фокусу",
    emptyBody:
      "Завершите первый учебный эпизод, чтобы открыть метрики тренда и консистентности.",
    emptyTitle: "Данных пока нет",
    errorFallback: "Не удалось загрузить аналитику.",
    errorNextStep:
      "Откройте обучение, чтобы продолжить учебный путь, или попробуйте аналитику снова после новой попытки.",
    errorProfileSummary: "Не удалось загрузить сводку профиля.",
    evidenceRecentAttempts: "недавних попыток",
    evidenceForecastFallback: "резервный прогноз",
    loading: "Загрузка аналитики...",
    loadingBody:
      "EduAI готовит следующий шаг и сводку прогресса для этого экрана.",
    moreViews: "Дополнительные представления",
    moreViewsBody:
      "Подробные расчёты остаются только для чтения и показываются отдельно от основного следующего шага.",
    moreViewsCards: [
      "Прогнозы помогают выбрать следующий шаг, но не доказывают причинный учебный прирост.",
      "Уверенность растёт только когда накапливается достаточно структурированных попыток.",
      "Каноническая структура тем остаётся якорем для агрегации и рекомендаций.",
    ],
    nextStepTitle: "Следующий рекомендуемый шаг",
    nextStepDataTitle: "Недостаточно данных - пройдите учебный эпизод",
    nextStepDataBody:
      "EduAI нужен полный учебный эпизод, прежде чем выводы о прогрессе станут надёжными.",
    nextStepWeakTitle: "Продолжить обучение по теме «{topic}»",
    nextStepWeakBody:
      "Недавние результаты показывают, что теме ещё нужен полный учебный проход перед быстрой практикой.",
    nextStepPracticeTitle: "Закрепить материал практикой",
    nextStepPracticeBody:
      "Недавние результаты достаточно нестабильны, поэтому короткая практика поможет закрепить материал.",
    nextStepFallbackTitle: "Продолжить обучение для сбора данных",
    nextStepFallbackBody:
      "Пока недостаточно надёжного сигнала, чтобы выбрать более узкое действие.",
    nextStepLearnCta: "Начать учебный эпизод",
    nextStepPracticeCta: "Создать быструю практику",
    readOnlyPill: "Режим аналитики только для чтения",
    startFirstEpisode: "Начать первый эпизод",
    subtitle:
      "Прогресс, ближайший учебный шаг и подробные расчёты в одном экране для учащегося.",
    title: "Аналитика прогресса обучения и готовности к следующему шагу",
    topicFocus: "Фокус по теме",
    noAttemptsIllustration: "Иллюстрация отсутствия попыток",
  },
  dashboard: {
    difficulty: {
      currentTarget: "Текущая цель",
      noRecentChange:
        "Недавнее изменение сложности не выведено из сохранённых попыток.",
      recentlyChanged: "Недавно изменилось.",
      reasonCooldown: "Пауза изменения сложности не позволила сразу изменить уровень.",
      reasonDecrease: "Недавняя точность была ниже целевого диапазона.",
      reasonIncrease: "Недавняя точность была выше целевого диапазона.",
      reasonFallback: "Зафиксированная причина: {reason}",
      reasonLowN: "Пока недостаточно чистых попыток.",
      reasonMissing: "Причина не была зафиксирована.",
      reasonWithinBand: "Недавняя точность была внутри целевого диапазона.",
      title: "Статус сложности",
    },
    consistency: {
      accuracyHelp:
        "Средняя абсолютная разница между прогнозируемой и фактической точностью.",
      durationDeviation: "Отклонение по длительности",
      durationHelp:
        "Средняя абсолютная разница между прогнозируемым и фактическим временем выполнения.",
      meanAbsoluteError: "Средняя абсолютная ошибка (точность)",
      samples: "Выборки",
      title: "Консистентность (последние 10 тестов)",
      whatIsThis: "Что это?",
    },
    forecast: {
      accuracyHelper: "приближённая оценка",
      body: "На основе ваших недавних попыток и отвеченных вопросов.",
      expectedAccuracy: "Ожидаемая точность",
      expectedDuration: "Ожидаемая длительность",
      noData: "Данных пока нет",
      rangeHelper: "диапазон расширяется при низкой уверенности",
      startEpisode: "Начать эпизод",
      title: "Прогноз перед запуском",
      eyebrow: "Прогноз следующего теста",
    },
    mastery: {
      evidence: "Основание",
      estimatedMastery: "Оценка освоения",
      lastActivity: "Последняя активность",
      noActivity: "Активности пока не было",
      noData: "Данных пока нет",
      title: "Сводка освоения",
    },
    trend: {
      actual: "Факт",
      ariaLabel: "График тренда точности",
      noAttempts:
        "Попыток пока нет. Завершите учебный эпизод, чтобы увидеть линии тренда.",
      predicted: "Прогноз",
      predictedMissing:
        "Прогнозируемая точность недоступна в недавних логах; показывается только фактический тренд.",
      title: "Тренд (последние 10 попыток)",
      titleEmpty: "Тренд (последние попытки)",
    },
  },
  topics: {
    addTopicGroup: "Создать группу тем",
    addTopicGroupFirst:
      "Сначала создайте группу тем, если эта тема должна участвовать в аналитике.",
    archive: "Архивировать",
    archiveTopic: "Архивировать тему?",
    backToTopics: "Назад к темам",
    createTopic: "Создать тему",
    createTopicGroup: "Создать группу тем",
    creating: "Создаём...",
    default: "По умолчанию",
    delete: "Удалить",
    deleteTopicGroup: "Удалить группу тем?",
    description: "Описание",
    errorCreateGroup: "Не удалось создать группу тем.",
    errorCreateTopic: "Не удалось создать тему.",
    errorLoad: "Не удалось загрузить темы.",
    errorAction: "Не удалось обновить темы.",
    errorNextStep:
      "Попробуйте снова или создайте тему после того, как список станет доступен.",
    emptyTitle: "Тем пока нет",
    emptyBody:
      "Сначала создайте тему, затем запустите первый учебный эпизод.",
    createFirstTopic: "Создать первую тему",
    manageGroupsSecondary:
      "Группы тем - необязательная организация. Сначала создайте тему, затем добавьте группу при необходимости.",
    actionRenameGroupTitle: "Переименовать группу тем",
    actionDeleteGroupTitle: "Удалить группу тем",
    actionRenameTopicTitle: "Переименовать тему",
    actionArchiveTopicTitle: "Архивировать тему",
    confirmDeleteTopicGroupBody:
      "Группа тем «{name}» будет удалена. Темы не удаляются этим окном; после удаления проверьте список тем, если группа использовалась для организации.",
    confirmArchiveTopicBody:
      "Тема «{title}» будет архивирована и пропадёт из обычного выбора учащегося.",
    saveChanges: "Сохранить изменения",
    confirmArchive: "Архивировать тему",
    confirmDelete: "Удалить",
    loading: "Загрузка тем...",
    loadingBody:
      "После загрузки можно создать тему или начать учебный эпизод из уже созданной темы.",
    name: "Название",
    newTopicGroupName: "Новое название группы тем",
    newTopicTitle: "Новое название темы",
    openTopics: "Открыть темы",
    parent: "Родитель",
    rename: "Переименовать",
    startEpisode: "Начать эпизод",
    subtitle:
      "Темы остаются каноническими для аналитики учащегося, рекомендаций и охвата эпизода. Персональные группы тем остаются дополнительным слоем, а не заменой основной структуры.",
    title: "Каноническая структура тем",
    topic: "Тема",
    topicGroup: "Группа тем",
    topicGroupAndTopics: "Группы тем и темы",
    topicGroupsNote:
      "Темы без назначения исключаются из аналитики.",
    topicGroupLabel: "Группа тем",
    topicGroupNameDefault: "Без назначения",
    topicTitle: "Заголовок",
    unassignedLabel: "Темы без назначения",
    unassignedOption: "Без назначения (исключено из аналитики)",
  },
  topicDetails: {
    addSection: "Добавить раздел",
    addSubtopic: "Добавить подтему",
    averageAccuracy: "Средняя точность",
    delete: "Удалить",
    deleteSection: "Удалить раздел?",
    descriptionOptional: "Описание (необязательно)",
    emptySubtopics: "Подтем пока нет.",
    emptySubtopicsBody:
      "Добавьте подтему, чтобы точнее задавать фокус будущих учебных эпизодов и быстрой практики.",
    errorLoad: "Не удалось загрузить тему.",
    errorAction: "Не удалось обновить структуру темы.",
    errorNextStep:
      "Вернитесь к списку тем и выберите другую тему или попробуйте открыть эту страницу снова.",
    loading: "Загрузка темы...",
    loadingBody:
      "После загрузки можно начать эпизод, посмотреть недавние попытки или организовать подтемы.",
    moveDown: "Переместить вниз",
    moveUp: "Переместить вверх",
    newSectionTitle: "Новое название раздела",
    noAttempts: "Попыток пока нет.",
    noAttemptsBody:
      "Начните учебный эпизод, чтобы создать первый сохранённый результат по этой теме.",
    notFound: "Тема не найдена.",
    noRecommendation:
      "Пока недостаточно оснований. Сначала запустите основной эпизод.",
    parentSection: "Родительский раздел",
    practiceThisSubtopic: "Практика",
    recentAttempts: "Недавние попытки",
    recommendationLoading: "Рекомендация загружается...",
    recommendedEpisode: "Рекомендуемый эпизод",
    rename: "Переименовать",
    sectionPathNote:
      "Каждая подтема уточняет охват для генерации практики и будущей аналитики.",
    startRecommendedEpisode: "Начать рекомендуемый эпизод",
    subtopic: "Подтема",
    structure: "Структура темы",
    actionRenameSectionTitle: "Переименовать подтему",
    actionDeleteSectionTitle: "Удалить подтему",
    confirmDeleteSectionBody:
      "Подтема «{title}» будет удалена из структуры темы.",
    saveSection: "Сохранить подтему",
    confirmDelete: "Удалить подтему",
    thisTopicExcluded:
      "Эта тема находится без назначения и исключена из аналитики.",
    totals: "Итоги",
    totalTests: "Всего тестов",
  },
  testRunner: {
    actualAccuracy: "Фактическая точность",
    actualTime: "Фактическое время",
    answerAll: "Ответьте на все вопросы, чтобы отправить тест.",
    attemptRecorded: "Ваша попытка сохранена.",
    customPractice: "Отдельная практика",
    customPracticeBody:
      "Сейчас вы проходите быстрый набор практики. EduAI сохранит результат, время ответа и изменения ответов для этой попытки. Практика помогает закрепить тему, но не заменяет полный учебный эпизод в разделе «Обучение».",
    evidenceSummaryBody:
      "Результат сохраняется после отправки. Он обновляет учебный прогресс только если проходит проверки качества.",
    evidenceSummaryTitle: "Что будет сохранено",
    evidenceTechnicalDetails: "Технические детали",
    excludedFromLearning: "Исключено из обновления прогресса:",
    nextSuggestion: "Следующее предложение",
    nextSuggestionBody: "Нужно больше данных, чтобы скорректировать сложность.",
    noTagStats: "Статистика по разметке не возвращена.",
    openCustomPractice: "Открыть практику",
    openLearnerEpisodeFlow: "Продолжить в обучении",
    practiceDoesNotReplaceEpisode:
      "Для основного учебного пути продолжите полный эпизод в разделе «Обучение».",
    predictionVsActual: "Прогноз и факт",
    question: "Вопрос",
    score: "Результат",
    submit: "Отправить тест",
    submitDisabledHint: "Ответьте на все вопросы перед отправкой.",
    submitting: "Отправляем...",
    suggestedNextDifficulty: "Предложенная следующая сложность",
  },
  adminOverview: {
    activeRuntime: "Runtime прогноза точности/времени",
    actor: "Актор",
    action: "Действие",
    actionResult: "Результат",
    artifactPath: "Путь к accuracy-артефакту",
    artifactPresent: "Артефакт присутствует",
    artifactSlot: "Слот артефакта",
    backendKind: "Тип accuracy backend",
    checked: "Проверено",
    datasetExport: "Эндпоинт экспорта датасета",
    dangerousActions: "Опасные действия оператора",
    excludedUsers: "Исключённые пользователи",
    errorLoad: "Не удалось загрузить операционную сводку админки.",
    episodeInspection: "Инспекция эпизодов",
    evaluationExport: "Эндпоинт экспорта evaluation",
    exports: "Экспорты и operator paths",
    futureTrainingEligible: "Допущены к future-training",
    ip: "IP",
    loading: "Загрузка операционной сводки админки...",
    noActions: "Аудированных operator actions пока нет.",
    notConfigured: "Не настроено",
    notReady: "Не готово",
    operationalAdmin: "Операционная админка",
    policyId: "Accuracy policy id",
    policyMode: "Режим policy",
    promptTemplates: "Шаблоны prompt",
    rateLimiter: "Rate limiter",
    readiness: "Готовность",
    readinessChecks: "Проверки готовности",
    runtimeBackend: "Accuracy runtime backend",
    runtimeArtifactStatus: "Статус accuracy runtime artifact",
    runtimeIntegration: "Интеграция runtime",
    runtimeWarning: "Предупреждение accuracy runtime",
    selectionSource: "Источник выбора",
    slotMetadataStatus: "Статус метаданных слота",
    slotState: "Состояние слота",
    subtitle:
      "Текущее состояние runtime, готовность, экспорты, future-training eligibility, видимость artifact slot и опасные действия оператора.",
    consentAndTrainingEligibility: "Согласие и допуск к обучению",
    consentGranted: "Согласие выдано",
    consentWithdrawn: "Согласие отозвано",
    explicitlyExcluded: "Явно исключены",
    systemSnapshot: "Снимок системы",
    target: "Цель",
    time: "Время",
    totalUsers: "Всего пользователей",
    trainingEligibleUsers: "Пользователи, допущенные к обучению",
    unknownActor: "Неизвестно",
    warning: "Предупреждение",
  },
};

export const uiMessages: Record<UiLocale, UiMessages> = {
  en: enMessages,
  ru: ruMessages,
};

export function isUiLocale(value: string | null | undefined): value is UiLocale {
  return value === "en" || value === "ru";
}

export function normalizeUiLocale(value: string | null | undefined): UiLocale {
  return isUiLocale(value) ? value : DEFAULT_UI_LOCALE;
}

export function getUiMessages(locale: UiLocale) {
  return uiMessages[locale];
}

export function getUiDateLocale(locale: UiLocale) {
  return DATE_LOCALES[locale];
}

export function persistUiLocale(locale: UiLocale) {
  if (typeof document === "undefined") return;
  document.cookie = `${UI_LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function readRecordValue(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function getErrorCode(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const directError = readRecordValue(record, "error");
  if (directError) return directError;
  const directCode = readRecordValue(record, "code");
  if (directCode) return directCode;

  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    return readRecordValue(nestedError as Record<string, unknown>, "code");
  }

  return null;
}

export function getErrorMessage(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const directMessage = readRecordValue(record, "message");
  if (directMessage) return directMessage;

  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    return readRecordValue(nestedError as Record<string, unknown>, "message");
  }

  return null;
}

export function localizeErrorMessage(
  input: unknown,
  locale: UiLocale,
  fallback: string,
) {
  const code = getErrorCode(input);
  if (code && code in ERROR_MESSAGES[locale]) {
    return ERROR_MESSAGES[locale][code as keyof (typeof ERROR_MESSAGES)[UiLocale]];
  }

  if (locale === "en") {
    const message = getErrorMessage(input);
    if (message) return message;
  }

  return fallback;
}

export function formatAxisLabel(axis: string, locale: UiLocale) {
  const labels = AXIS_LABELS[locale] as Record<string, string>;
  return labels[axis] ?? axis.replaceAll("_", " ");
}

export function formatPreferenceValue(
  axis: string,
  value: string | null | undefined,
  locale: UiLocale,
) {
  if (!value) return null;
  if (axis === "difficulty_target") {
    return formatDifficultyLabel(value, locale);
  }

  const axisLabels = PREFERENCE_VALUE_LABELS[locale] as Record<
    string,
    Record<string, string>
  >;
  return axisLabels[axis]?.[value] ?? value.replaceAll("_", " ");
}

export function formatDifficultyLabel(value: string | null, locale: UiLocale) {
  if (value === "easy" || value === "medium" || value === "hard") {
    return DIFFICULTY_LABELS[locale][value];
  }
  return DIFFICULTY_LABELS[locale].unknown;
}

export function formatDifficultyFallback(locale: UiLocale) {
  return DIFFICULTY_LABELS[locale].keepCurrent;
}

export function formatEpisodeRoleLabelForLocale(
  role: keyof typeof EPISODE_ROLE_LABELS.en | null,
  locale: UiLocale,
) {
  if (!role) return EPISODE_ROLE_LABELS[locale].delayed_recheck;
  return EPISODE_ROLE_LABELS[locale][role];
}

export function formatEpisodeStatusLabelForLocale(
  status: keyof typeof EPISODE_STATUS_LABELS.en,
  locale: UiLocale,
) {
  return EPISODE_STATUS_LABELS[locale][status];
}

export function formatArmLabelForLocale(value: string, locale: UiLocale) {
  if (value in ARM_LABELS[locale]) {
    return ARM_LABELS[locale][value as keyof typeof ARM_LABELS.en];
  }
  return value;
}

export function formatAttemptPathLabel(
  kind: LearnerAttemptPathKind,
  locale: UiLocale,
) {
  return ATTEMPT_PATH_LABELS[locale][kind];
}

export function formatAdaptiveImpactLabel(
  impactKind: LearnerAttemptAdaptiveImpactKind,
  locale: UiLocale,
) {
  return ADAPTIVE_IMPACT_LABELS[locale][impactKind];
}

export function formatLearningExclusionReasonLabel(
  reasonCode: LearningExclusionReasonCode | null | undefined,
  locale: UiLocale,
) {
  if (!reasonCode) return null;
  return LEARNING_EXCLUSION_REASON_LABELS[locale][reasonCode];
}

export function formatAttemptEvidenceNote(
  contract: LearnerAttemptEvidenceContract,
  locale: UiLocale,
) {
  if (locale === "ru") {
    if (contract.path.kind === "learn_episode") {
      return contract.adaptive.updatesState
        ? "Эта проверка относится к основному учебному эпизоду и обновила прогресс. Диалог внутри эпизода остаётся вспомогательным контекстом."
        : "Эта проверка сохранена в истории учебного эпизода, но прогресс не обновился. Диалог внутри эпизода остаётся вспомогательным контекстом.";
    }
    if (contract.path.kind === "custom_practice") {
      return contract.adaptive.updatesState
        ? "Эта отдельная практика остаётся вторичным путём, но прошла проверки качества и обновила учебный прогресс."
        : "Эта отдельная практика сохранена, но учебный прогресс не обновился.";
    }
    return contract.adaptive.updatesState
      ? "Эта отдельная проверка обновила учебный прогресс."
      : "Эта отдельная проверка сохранена только как результат попытки без обновления прогресса.";
  }

  if (contract.path.kind === "learn_episode") {
    return contract.adaptive.updatesState
      ? "This check belongs to the main learning episode and updated progress. Dialogue inside the episode remains supporting context."
      : "This check stays in the learning episode history, but progress was not updated. Dialogue inside the episode remains supporting context.";
  }
  if (contract.path.kind === "custom_practice") {
    return contract.adaptive.updatesState
      ? "This quick practice remains secondary to Learn, but it passed quality checks and updated learning progress."
      : "This quick practice was saved, but learning progress was not updated.";
  }
  return contract.adaptive.updatesState
    ? "This standalone assessment updated learning progress."
    : "This standalone assessment was saved as an attempt result only, without a progress update.";
}
