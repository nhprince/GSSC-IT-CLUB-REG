(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const loginScreen = $("loginScreen");
  const appShell = $("appShell");
  const loginForm = $("loginForm");
  const loginError = $("loginError");
  const loginBtn = $("loginBtn");

  const searchInput = $("searchInput");
  const departmentFilter = $("departmentFilter");
  const sortSelect = $("sortSelect");
  const exportBtn = $("exportBtn");
  const membersTableBody = $("membersTableBody");
  const resultCount = $("resultCount");

  let deptChart = null;
  let currentDeleteId = null;
  let searchDebounce = null;

  // ---------- Helpers ----------

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("").toUpperCase();
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso.replace(" ", "T") + "Z");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function openModal(id) {
    $(id).classList.add("active");
  }

  function closeModal(id) {
    $(id).classList.remove("active");
  }

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => closeModal(el.dataset.close));
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("active");
    });
  });

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 401) {
      showLogin();
      throw new Error("Session expired. Please log in again.");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  // ---------- Auth ----------

  function showLogin() {
    appShell.classList.remove("active");
    loginScreen.style.display = "flex";
  }

  function showApp() {
    loginScreen.style.display = "none";
    appShell.classList.add("active");
    initDashboard();
  }

  async function checkAuth() {
    try {
      const res = await fetch("/api/admin/check");
      if (res.ok) {
        showApp();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.classList.remove("active");
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span>';

    try {
      const password = $("password").value;
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed.");
      $("password").value = "";
      showApp();
    } catch (err) {
      loginError.textContent = err.message;
      loginError.classList.add("active");
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "Log in";
    }
  });

  $("logoutBtn").addEventListener("click", async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
  });

  // ---------- Dashboard init ----------

  let dashboardInitialized = false;

  function initDashboard() {
    loadStats();
    loadMembers();

    if (!dashboardInitialized) {
      dashboardInitialized = true;

      searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(loadMembers, 350);
      });
      departmentFilter.addEventListener("change", loadMembers);
      sortSelect.addEventListener("change", loadMembers);
      exportBtn.addEventListener("click", () => {
        window.location.href = "/api/admin/export";
      });
    }
  }

  // ---------- Stats ----------

  async function loadStats() {
    try {
      const stats = await api("/api/admin/stats");

      $("statTotal").textContent = stats.total;
      $("statRecent").textContent = stats.recent;
      $("statDepartments").textContent = stats.departments.length;

      const topInterest = Object.entries(stats.interests).sort((a, b) => b[1] - a[1])[0];
      $("statTopInterest").textContent = topInterest ? topInterest[0] : "—";

      populateDepartmentFilter(stats.departments.map((d) => d.department));
      renderChart(stats.departments);
    } catch (err) {
      showToast(err.message);
    }
  }

  function populateDepartmentFilter(departments) {
    const current = departmentFilter.value;
    const options = ['<option value="">All departments</option>']
      .concat(departments.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`));
    departmentFilter.innerHTML = options.join("");
    if (departments.includes(current)) departmentFilter.value = current;
  }

  function renderChart(departments) {
    const ctx = $("deptChart").getContext("2d");
    const labels = departments.map((d) => d.department);
    const counts = departments.map((d) => d.count);

    if (deptChart) {
      deptChart.data.labels = labels;
      deptChart.data.datasets[0].data = counts;
      deptChart.update();
      return;
    }

    deptChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Members",
          data: counts,
          backgroundColor: "#7f0206",
          borderRadius: 6,
          maxBarThickness: 40,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#e1e6db" } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ---------- Members table ----------

  async function loadMembers() {
    membersTableBody.innerHTML = '<tr class="loading-row"><td colspan="7">Loading members…</td></tr>';

    const [sortCol, sortOrder] = sortSelect.value.split(":");
    const params = new URLSearchParams({
      search: searchInput.value.trim(),
      department: departmentFilter.value,
      sort: sortCol,
      order: sortOrder,
    });

    try {
      const data = await api(`/api/admin/members?${params.toString()}`);
      renderMembers(data.members);
    } catch (err) {
      membersTableBody.innerHTML = `<tr class="loading-row"><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderMembers(members) {
    resultCount.textContent = `${members.length} member${members.length === 1 ? "" : "s"} found`;

    if (members.length === 0) {
      membersTableBody.innerHTML = `
        <tr><td colspan="7">
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 1rem;"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
            <div>No members match your filters.</div>
          </div>
        </td></tr>`;
      return;
    }

    membersTableBody.innerHTML = members.map((m) => `
      <tr>
        <td class="member-name-td" data-label="Name">
          <div class="member-name-cell">
            <div class="avatar">${escapeHtml(initials(m.full_name))}</div>
            <div class="details">
              <strong>${escapeHtml(m.full_name)}</strong>
              <span>${escapeHtml(m.blood_group || "")}</span>
            </div>
          </div>
        </td>
        <td data-label="Student ID">${escapeHtml(m.student_id)}</td>
        <td data-label="Department">${escapeHtml(m.department)}</td>
        <td data-label="Year / Session">${escapeHtml(m.year)}<br /><span class="text-muted">${escapeHtml(m.session)}</span></td>
        <td data-label="Contact">${escapeHtml(m.email)}<br /><span class="text-muted">${escapeHtml(m.phone)}</span></td>
        <td data-label="Registered">${formatDate(m.created_at)}</td>
        <td data-label="">
          <div class="row-actions">
            <button class="icon-btn" title="View" onclick="AdminPanel.viewMember(${m.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="icon-btn" title="Edit" onclick="AdminPanel.editMember(${m.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path></svg>
            </button>
            <button class="icon-btn danger" title="Delete" onclick="AdminPanel.deleteMember(${m.id}, '${escapeHtml(m.full_name).replace(/'/g, "\\'")}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  // ---------- View modal ----------

  function detailRow(label, value, full = false) {
    return `<div class="v-item${full ? " detail-full" : ""}"><div class="k">${escapeHtml(label)}</div><div class="v">${value}</div></div>`;
  }

  async function viewMember(id) {
    openModal("viewModal");
    $("viewModalBody").innerHTML = '<p class="text-muted">Loading…</p>';

    try {
      const { member: m } = await api(`/api/admin/members/${id}`);

      let html = "";

      html += `<div class="modal-photos">`;
      if (m.profile_photo) html += `<div><img src="${m.profile_photo}" alt="Profile" /><div class="photo-label">Profile</div></div>`;
      if (m.id_document_photo) html += `<div><img src="${m.id_document_photo}" alt="ID document" /><div class="photo-label">ID / Birth cert.</div></div>`;
      html += `</div>`;

      html += `<div class="modal-section-title">Personal</div><div class="detail-grid">`;
      html += `<div><div class="k">Full name</div><div class="v">${escapeHtml(m.full_name)}</div></div>`;
      html += `<div><div class="k">Date of birth</div><div class="v">${escapeHtml(m.date_of_birth) || "—"}</div></div>`;
      html += `<div><div class="k">Blood group</div><div class="v">${escapeHtml(m.blood_group) || "—"}</div></div>`;
      html += `</div>`;

      html += `<div class="modal-section-title">Academic</div><div class="detail-grid">`;
      html += `<div><div class="k">Student ID</div><div class="v">${escapeHtml(m.student_id)}</div></div>`;
      html += `<div><div class="k">Department</div><div class="v">${escapeHtml(m.department)}</div></div>`;
      html += `<div><div class="k">Year</div><div class="v">${escapeHtml(m.year)}</div></div>`;
      html += `<div><div class="k">Session</div><div class="v">${escapeHtml(m.session)}</div></div>`;
      html += `</div>`;

      html += `<div class="modal-section-title">Contact & guardian</div><div class="detail-grid">`;
      html += `<div><div class="k">Email</div><div class="v">${escapeHtml(m.email)}</div></div>`;
      html += `<div><div class="k">Phone</div><div class="v">${escapeHtml(m.phone)}</div></div>`;
      html += `<div class="detail-full"><div class="k">Present address</div><div class="v">${escapeHtml(m.present_address) || "—"}</div></div>`;
      html += `<div class="detail-full"><div class="k">Permanent address</div><div class="v">${escapeHtml(m.permanent_address) || "—"}</div></div>`;
      html += `<div><div class="k">Guardian's name</div><div class="v">${escapeHtml(m.guardian_name) || "—"}</div></div>`;
      html += `<div><div class="k">Guardian's phone</div><div class="v">${escapeHtml(m.guardian_phone) || "—"}</div></div>`;
      html += `</div>`;

      html += `<div class="modal-section-title">Additional</div><div class="detail-grid">`;
      html += `<div class="detail-full"><div class="k">Interests</div><div class="v">${m.interests.length ? escapeHtml(m.interests.join(", ")) : "—"}</div></div>`;
      html += `<div class="detail-full"><div class="k">Social link</div><div class="v">${m.social_link ? `<a href="${escapeHtml(m.social_link)}" target="_blank" rel="noopener">${escapeHtml(m.social_link)}</a>` : "—"}</div></div>`;
      html += `<div class="detail-full"><div class="k">Reason to join</div><div class="v">${escapeHtml(m.reason_to_join) || "—"}</div></div>`;
      html += `<div class="detail-full"><div class="k">Previous experience</div><div class="v">${escapeHtml(m.previous_experience) || "—"}</div></div>`;
      html += `<div class="detail-full"><div class="k">Registered on</div><div class="v">${formatDate(m.created_at)}</div></div>`;
      html += `</div>`;

      $("viewModalBody").innerHTML = html;
    } catch (err) {
      $("viewModalBody").innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
    }
  }

  // ---------- Edit modal ----------

  function editField(id, label, value, type = "text") {
    if (type === "textarea") {
      return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><textarea id="${id}" rows="2">${escapeHtml(value || "")}</textarea></div>`;
    }
    return `<div class="field"><label for="${id}">${escapeHtml(label)}</label><input type="${type}" id="${id}" value="${escapeHtml(value || "")}" /></div>`;
  }

  async function editMember(id) {
    openModal("editModal");
    $("editModalBody").innerHTML = '<p class="text-muted">Loading…</p>';
    $("edit_id").value = id;

    try {
      const { member: m } = await api(`/api/admin/members/${id}`);

      let html = "";
      html += `<div class="field-row">${editField("edit_full_name", "Full name", m.full_name)}${editField("edit_student_id", "Student ID", m.student_id)}</div>`;
      html += `<div class="field-row">${editField("edit_department", "Department", m.department)}${editField("edit_year", "Year", m.year)}</div>`;
      html += `<div class="field-row">${editField("edit_session", "Session", m.session)}${editField("edit_blood_group", "Blood group", m.blood_group)}</div>`;
      html += `<div class="field-row">${editField("edit_email", "Email", m.email, "email")}${editField("edit_phone", "Phone", m.phone, "tel")}</div>`;
      html += editField("edit_present_address", "Present address", m.present_address, "textarea");
      html += editField("edit_permanent_address", "Permanent address", m.permanent_address, "textarea");
      html += `<div class="field-row">${editField("edit_guardian_name", "Guardian's name", m.guardian_name)}${editField("edit_guardian_phone", "Guardian's phone", m.guardian_phone)}</div>`;
      html += editField("edit_reason_to_join", "Reason to join", m.reason_to_join, "textarea");
      html += editField("edit_previous_experience", "Previous experience", m.previous_experience, "textarea");
      html += editField("edit_social_link", "Social link", m.social_link, "url");

      $("editModalBody").innerHTML = html;
    } catch (err) {
      $("editModalBody").innerHTML = `<p class="text-muted">${escapeHtml(err.message)}</p>`;
    }
  }

  $("editForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("edit_id").value;
    const saveBtn = $("saveEditBtn");
    saveBtn.disabled = true;
    const originalText = saveBtn.textContent;
    saveBtn.innerHTML = '<span class="spinner"></span>';

    const payload = {
      full_name: $("edit_full_name").value.trim(),
      student_id: $("edit_student_id").value.trim(),
      department: $("edit_department").value.trim(),
      year: $("edit_year").value.trim(),
      session: $("edit_session").value.trim(),
      blood_group: $("edit_blood_group").value.trim(),
      email: $("edit_email").value.trim(),
      phone: $("edit_phone").value.trim(),
      present_address: $("edit_present_address").value.trim(),
      permanent_address: $("edit_permanent_address").value.trim(),
      guardian_name: $("edit_guardian_name").value.trim(),
      guardian_phone: $("edit_guardian_phone").value.trim(),
      reason_to_join: $("edit_reason_to_join").value.trim(),
      previous_experience: $("edit_previous_experience").value.trim(),
      social_link: $("edit_social_link").value.trim(),
    };

    try {
      await api(`/api/admin/members/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      closeModal("editModal");
      showToast("Member updated.");
      loadMembers();
      loadStats();
    } catch (err) {
      showToast(err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });

  // ---------- Delete ----------

  function deleteMember(id, name) {
    currentDeleteId = id;
    $("deleteMemberName").textContent = name;
    openModal("deleteModal");
  }

  $("confirmDeleteBtn").addEventListener("click", async () => {
    if (!currentDeleteId) return;
    const btn = $("confirmDeleteBtn");
    btn.disabled = true;

    try {
      await api(`/api/admin/members/${currentDeleteId}`, { method: "DELETE" });
      closeModal("deleteModal");
      showToast("Member removed.");
      loadMembers();
      loadStats();
    } catch (err) {
      showToast(err.message);
    } finally {
      btn.disabled = false;
      currentDeleteId = null;
    }
  });

  // Expose handlers used by inline onclick attributes in table rows.
  window.AdminPanel = { viewMember, editMember, deleteMember };

  checkAuth();
})();
