(function initPopup() {
  "use strict";

  const settingsApi = globalThis.YTWheelSettings;
  const wheelInput = globalThis.YTWheelInput;
  const inverted = document.querySelector("#inverted");
  const adSeeking = document.querySelector("#ad-seeking");
  const reset = document.querySelector("#reset");
  const status = document.querySelector("#status");
  let statusTimer = null;

  const sliders = [
    {
      key: "secondsPerHundredPixels",
      input: document.querySelector("#sensitivity"),
      output: document.querySelector("#sensitivity-value"),
      format: (value) => `${value}초 / 100px`,
    },
    {
      key: "requestIntervalMs",
      input: document.querySelector("#request-interval"),
      output: document.querySelector("#request-interval-value"),
      format: (value) => (value === 0 ? "입력마다" : `${value}ms`),
    },
    {
      key: "gestureEndDelayMs",
      input: document.querySelector("#gesture-end"),
      output: document.querySelector("#gesture-end-value"),
      format: (value) => `${value}ms`,
    },
  ];

  function renderSlider(slider, value) {
    slider.input.value = String(value);
    slider.output.value = slider.format(value);
  }

  function render(settings) {
    for (const slider of sliders) {
      renderSlider(slider, settings[slider.key]);
    }
    inverted.checked = settings.inverted;
    adSeeking.checked = settings.adSeeking;
  }

  function showStatus(message) {
    status.textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      status.textContent = "";
    }, 1200);
  }

  function readForm() {
    const settings = {
      inverted: inverted.checked,
      adSeeking: adSeeking.checked,
    };
    for (const slider of sliders) {
      settings[slider.key] = Number(slider.input.value);
    }
    return settings;
  }

  async function persist() {
    try {
      render(await settingsApi.saveSettings(readForm()));
      showStatus("저장됨");
    } catch (_error) {
      showStatus("설정을 저장하지 못했습니다.");
    }
  }

  for (const slider of sliders) {
    const { input } = slider;
    input.addEventListener("input", () => {
      slider.output.value = slider.format(Number(input.value));
    });
    input.addEventListener("change", persist);
    input.addEventListener("wheel", (event) => {
      const step = wheelInput.getWheelStep(event.deltaX, event.deltaY, inverted.checked);
      if (step === 0) {
        return;
      }

      event.preventDefault();
      const nextValue = Math.min(
        Math.max(Number(input.value) + step * Number(input.step), Number(input.min)),
        Number(input.max),
      );
      renderSlider(slider, nextValue);
      void persist();
    }, { passive: false });
  }
  inverted.addEventListener("change", persist);
  adSeeking.addEventListener("change", persist);
  reset.addEventListener("click", async () => {
    render(settingsApi.DEFAULT_SETTINGS);
    await persist();
  });

  settingsApi.loadSettings().then(render);
})();
