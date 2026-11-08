function subscribeTraining() {
  const PATHS = {
    trainingAccessRequests:   "training/accessRequests",
    trainingCourses:          "training/courses",
    trainingChecklists:       "training/checklists",
    trainingResources:        "training/resources",
    trainingEnrollments:      "training/enrollments",
    trainingProgress:         "training/progress",
    trainingCertificates:     "training/certificates",
    trainingQuizSubmissions:  "training/quizSubmissions",
    trainingCertTemplates:    "training/certificateTemplates",
    trainingCourseCompletions:"training/courseCompletions",
    trainingUsers:            "training/users"
  };

  const ARRAY_KEYS = ["trainingCertificates", "trainingUsers", "trainingAccessRequests"];

  for (const [key, path] of Object.entries(PATHS)) {
    onValue(ref(db, P(path)), (snap) => {
      const raw = snap.exists() ? snap.val() : {};
      state.data[key] = normalize(raw, ARRAY_KEYS.includes(key));

      /* Stamp uid/id onto accessRequests so the renderer never sees `undefined` */
      if (key === "trainingAccessRequests") {
        state.data[key] = Object.entries(raw || {}).map(([uid, v]) => ({ uid, ...v, id: uid }));
      }

      if (key === "trainingUsers") {
        const arr = Array.isArray(state.data.trainingUsers)
          ? state.data.trainingUsers
          : Object.values(state.data.trainingUsers || {});
        state.data.users = arr.filter((u) => u && (u.role === "trainer" || !u.role));
        state.data.portalUsers = arr.filter((u) => u && u.role !== "trainer" && u.role);
      }

      console.info(`[sa/sub] ${path} →`, state.data[key]);
      updateBadges();

      const name = state.currentTab.replace(/^training-/, "");
      try {
        if (name === "overview")     renderTrainingOverview();
        if (name === "requests")     renderTrainingRequests();
        if (name === "users")        renderTrainingUsers();
        if (name === "progress")     renderTrainingProgress();
        if (name === "quizzes")      renderTrainingQuizzes();
        if (name === "certificates") renderTrainingCertificates();
      } catch (e) {
        console.warn("[sa] render during subscribe failed:", key, e);
      }
    }, (err) => {
      /* Log EVERY error — permission_denied is critical, not noise */
      console.error(`[sa/sub] ${path} failed:`, err.code, err.message);
    });
  }

  onValue(ref(db, `${ROOT}/${ORG}/users`), (snap) => {
    state.data.users = normalize(snap.exists() ? snap.val() : {}, true);
    try { renderTrainingUsers(); renderTrainingProgress(); } catch (e) {}
  }, (err) => {
    console.error(`[sa/sub] org users failed:`, err.code, err.message);
  });
}
