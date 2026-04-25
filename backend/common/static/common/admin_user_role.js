// Toggle visibility of the Collections selector on the Django User admin
// based on the selected role (Contributor vs Editor).

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

    var collectionsWidget = document.querySelector('[name="collections"]');
    if (!collectionsWidget) {
      return;
    }

    var collectionsRow = collectionsWidget.closest(".form-row") || collectionsWidget.closest(".fieldBox");
    if (!collectionsRow) {
      return;
    }

    function syncVisibility() {
      var value = roleSelect.value || "contributor";
      if (value === "editor") {
        collectionsRow.style.display = "";
      } else {
        collectionsRow.style.display = "none";
      }
    }

    syncVisibility();
    roleSelect.addEventListener("change", syncVisibility);
  });
})();
