(() => {
  "use strict";

  const TOTAL_STEPS = 6;
  const STEP_TITLES = {
    1: "Personal Information",
    2: "Academic Information",
    3: "Contact & Guardian",
    4: "Additional Information",
    5: "Documents",
    6: "Review & Submit",
  };

  const state = {
    currentStep: 1,
    profile_photo: null,
    id_document_photo: null,
    processingProfile: false,
    processingId: false,
  };

  const $ = (id) => document.getElementById(id);

  const form = $("registrationForm");
  const progressTrack = $("progressTrack");
  const stepTitleEl = $("stepTitle");
  const stepCountEl = $("stepCount");
  const backBtn = $("backBtn");
  const nextBtn = $("nextBtn");
  const submitError = $("submitError");
  const formShell = $("formShell");
  const successScreen = $("successScreen");

  const departmentSelect = $("department");
  const departmentOtherField = $("field_department_other");
  const departmentOtherInput = $("department_other");

  const sameAddressCheckbox = $("sameAddress");
  const presentAddressInput = $("present_address");
  const permanentAddressField = $("field_permanent_address");
  const permanentAddressInput = $("permanent_address");

  // ---------- Progress bar ----------

  function buildProgressTrack() {
    progressTrack.innerHTML = "";
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const segment = document.createElement("div");
      segment.className = "segment";
      segment.dataset.segment = String(i);
      segment.innerHTML = '<div class="fill"></div>';
      progressTrack.appendChild(segment);
    }
  }

  function updateProgress() {
    document.querySelectorAll(".segment").forEach((seg) => {
      const i = Number(seg.dataset.segment);
      seg.classList.toggle("done", i < state.currentStep);
      seg.classList.toggle("current", i === state.currentStep);
    });
    stepTitleEl.textContent = STEP_TITLES[state.currentStep];
    stepCountEl.textContent = `Step ${state.currentStep} of ${TOTAL_STEPS}`;
  }

  // ---------- Step navigation ----------

  function showStep(step) {
    document.querySelectorAll(".step").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.step) === step);
    });
    state.currentStep = step;
    updateProgress();

    backBtn.style.visibility = step === 1 ? "hidden" : "visible";

    if (step === TOTAL_STEPS) {
      nextBtn.textContent = "Submit Registration";
    } else if (step === TOTAL_STEPS - 1) {
      nextBtn.textContent = "Continue to Review";
    } else {
      nextBtn.textContent = "Continue";
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setError(fieldId, isValid) {
    const el = $(fieldId);
    if (el) el.classList.toggle("has-error", !isValid);
    return isValid;
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function validateStep(step) {
    let valid = true;

    if (step === 1) {
      valid = setError("field_full_name", $("full_name").value.trim() !== "") && valid;
    }

    if (step === 2) {
      valid = setError("field_student_id", $("student_id").value.trim() !== "") && valid;

      const deptValue = departmentSelect.value;
      const deptValid = deptValue !== "" && (deptValue !== "__other__" || departmentOtherInput.value.trim() !== "");
      valid = setError("field_department", deptValue !== "") && valid;
      if (deptValue === "__other__") {
        valid = setError("field_department_other", departmentOtherInput.value.trim() !== "") && valid;
      }

      valid = setError("field_year", $("year").value.trim() !== "") && valid;
      valid = setError("field_session", $("session").value.trim() !== "") && valid;
    }

    if (step === 3) {
      valid = setError("field_email", isEmail($("email").value.trim())) && valid;
      valid = setError("field_phone", $("phone").value.trim() !== "") && valid;
    }

    if (step === 5) {
      if (state.processingId) return false;
      valid = setError("field_id_document_photo", !!state.id_document_photo) && valid;
    }

    return valid;
  }

  backBtn.addEventListener("click", () => {
    if (state.currentStep > 1) showStep(state.currentStep - 1);
  });

  nextBtn.addEventListener("click", () => {
    if (state.currentStep === TOTAL_STEPS) {
      submitForm();
      return;
    }

    if (!validateStep(state.currentStep)) return;

    const next = state.currentStep + 1;
    if (next === TOTAL_STEPS) buildReview();
    showStep(next);
  });

  // ---------- Department "Other" toggle ----------

  departmentSelect.addEventListener("change", () => {
    departmentOtherField.style.display = departmentSelect.value === "__other__" ? "block" : "none";
  });

  // ---------- Same-as-present address ----------

  function syncAddress() {
    if (sameAddressCheckbox.checked) {
      permanentAddressInput.value = presentAddressInput.value;
    }
  }

  sameAddressCheckbox.addEventListener("change", () => {
    permanentAddressField.style.display = sameAddressCheckbox.checked ? "none" : "block";
    syncAddress();
  });

  presentAddressInput.addEventListener("input", syncAddress);

  // ---------- Image compression ----------

  function compressImage(file, maxDim = 900, quality = 0.72) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Could not read image."));
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else if (height >= width && height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function wireUpload(inputId, previewId, labelId, stateKey, processingKey) {
    const input = $(inputId);
    const preview = $(previewId);
    const label = $(labelId);
    const originalLabel = label.textContent;

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;

      state[processingKey] = true;
      label.textContent = "Processing image…";

      try {
        const dataUrl = await compressImage(file);
        state[stateKey] = dataUrl;
        preview.innerHTML = `<img src="${dataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
        label.textContent = "Photo selected — tap to change";
        if (inputId === "id_document_photo") setError("field_id_document_photo", true);
      } catch (err) {
        state[stateKey] = null;
        label.textContent = originalLabel;
        input.value = "";
      } finally {
        state[processingKey] = false;
      }
    });
  }

  wireUpload("profile_photo", "profilePreview", "profileUploadLabel", "profile_photo", "processingProfile");
  wireUpload("id_document_photo", "idDocPreview", "idDocUploadLabel", "id_document_photo", "processingId");

  // ---------- Review ----------

  function fieldLabel(value, fallback = "—") {
    const v = (value || "").toString().trim();
    return v === "" ? fallback : escapeHtml(v);
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function collectData() {
    const department = departmentSelect.value === "__other__" ? departmentOtherInput.value.trim() : departmentSelect.value;
    const interests = Array.from(document.querySelectorAll('input[name="interests"]:checked')).map((el) => el.value);

    return {
      full_name: $("full_name").value.trim(),
      date_of_birth: $("date_of_birth").value,
      blood_group: $("blood_group").value,
      profile_photo: state.profile_photo,

      student_id: $("student_id").value.trim(),
      department,
      year: $("year").value,
      session: $("session").value.trim(),

      email: $("email").value.trim(),
      phone: $("phone").value.trim(),
      present_address: $("present_address").value.trim(),
      permanent_address: $("permanent_address").value.trim(),
      guardian_name: $("guardian_name").value.trim(),
      guardian_phone: $("guardian_phone").value.trim(),

      reason_to_join: $("reason_to_join").value.trim(),
      previous_experience: $("previous_experience").value.trim(),
      interests,
      social_link: $("social_link").value.trim(),
      id_document_photo: state.id_document_photo,

      website_url: $("website_url").value,
    };
  }

  function buildReview() {
    const d = collectData();

    const section = (title, items) => `
      <div class="review-section">
        <h3>${title}</h3>
        <div class="review-grid">
          ${items.map(([k, v]) => `<div class="review-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
        </div>
      </div>`;

    let html = "";

    html += `<div class="review-photos">`;
    if (d.profile_photo) html += `<img src="${d.profile_photo}" alt="Profile photo" />`;
    if (d.id_document_photo) html += `<img src="${d.id_document_photo}" alt="ID document" />`;
    html += `</div>`;

    html += section("Personal", [
      ["Full name", fieldLabel(d.full_name)],
      ["Date of birth", fieldLabel(d.date_of_birth)],
      ["Blood group", fieldLabel(d.blood_group)],
    ]);

    html += section("Academic", [
      ["Student ID", fieldLabel(d.student_id)],
      ["Department", fieldLabel(d.department)],
      ["Year", fieldLabel(d.year)],
      ["Session", fieldLabel(d.session)],
    ]);

    html += section("Contact & guardian", [
      ["Email", fieldLabel(d.email)],
      ["Phone", fieldLabel(d.phone)],
      ["Present address", fieldLabel(d.present_address)],
      ["Permanent address", fieldLabel(d.permanent_address)],
      ["Guardian's name", fieldLabel(d.guardian_name)],
      ["Guardian's phone", fieldLabel(d.guardian_phone)],
    ]);

    html += section("Additional", [
      ["Interests", d.interests.length ? escapeHtml(d.interests.join(", ")) : "—"],
      ["Social link", fieldLabel(d.social_link)],
      ["Reason to join", fieldLabel(d.reason_to_join)],
      ["Previous experience", fieldLabel(d.previous_experience)],
    ]);

    $("reviewContent").innerHTML = html;
  }

  // ---------- Submit ----------

  async function submitForm() {
    submitError.classList.remove("active");
    nextBtn.disabled = true;
    backBtn.disabled = true;
    const originalText = nextBtn.textContent;
    nextBtn.innerHTML = '<span class="spinner"></span>';

    try {
      const payload = collectData();
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      formShell.classList.add("hidden");
      successScreen.classList.add("active");
    } catch (err) {
      submitError.textContent = err.message || "Something went wrong. Please try again.";
      submitError.classList.add("active");
      submitError.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      nextBtn.disabled = false;
      backBtn.disabled = false;
      nextBtn.textContent = originalText;
    }
  }

  $("submitAnotherBtn").addEventListener("click", () => window.location.reload());

  form.addEventListener("submit", (e) => e.preventDefault());

  // ---------- Init ----------

  buildProgressTrack();
  showStep(1);
})();
