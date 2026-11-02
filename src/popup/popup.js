(function initPopup() {
  "use strict";

  const settingsApi = globalThis.YTWheelSettings;
  const sensitivity = document.querySelector("#sensitivity");
  const sensitivityValue = document.querySelector("#sensitivity-value");
  const inverted = document.querySelector("#inverted");
  const reset = document.querySelector("#reset");
  const status = document.querySelector("#status");
  let statusTimer = null;

  function render(settings) {
    sensitivity.value = String(settings.secondsPerHundredPixels);
    sensitivityValue.value = `${settings.secondsPerHundredPixels}초 / 100px`;
    inverted.checked = settings.inverted;
  }

  function showStatus(message) {
    status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = "";
    }, 1200);
  }

  async function persist() {
    try {
      const saved = await settingsApi.saveSettings({
        secondsPerHundredPixels: Number(sensitivity.value),
        inverted: inverted.checked,
      });
      render(saved);
      showStatus("저장됨");
    } catch (_error) {
      showStatus("설정을 저장하지 못했습니다.");
    }
  }

  sensitivity.addEventListener("input", () => {
    sensitivityValue.value = `${sensitivity.value}초 / 100px`;
  });
  sensitivity.addEventListener("change", persist);
  inverted.addEventListener("change", persist);
  reset.addEventListener("click", async () => {
    render(settingsApi.DEFAULT_SETTINGS);
    await persist();
  });

  settingsApi.loadSettings().then(render);
})();
