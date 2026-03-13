// Toggle visibility of the Locations selector on the Django User admin
// based on the selected high-level role (Contributor vs State Editor).

(function () {
  function onReady(fn) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      fn();
    } else {
      document.addEventListener("DOMContentLoaded", fn);
    }
  }

  onReady(function () {
    var roleSelect = document.querySelector('select[name="role"]');
    if (!roleSelect) {
      return;
    }

    // Find the form row / field container that holds the locations selector
    var locationsWidget = document.querySelector('[name="locations"]');
    if (!locationsWidget) {
      return;
    }

    // Walk up to the closest row container used by Django admin
    var locationsRow = locationsWidget.closest(".form-row") || locationsWidget.closest(".fieldBox");
    if (!locationsRow) {
      return;
    }

    function syncVisibility() {
      var value = roleSelect.value || "contributor";
      if (value === "state_editor") {
        locationsRow.style.display = "";
      } else {
        locationsRow.style.display = "none";
      }
    }

    syncVisibility();
    roleSelect.addEventListener("change", syncVisibility);
  });
})();

