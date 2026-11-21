// ガチャ演出の描画性能を計測用に要約する（平均FPSと、最も重かった1秒間のFPS）。
const round1 = (v) => Math.round(v * 10) / 10;

export function createFrameStats() {
  let frames = 0, total = 0, winFrames = 0, winTime = 0, minFps = Infinity;
  return {
    reset() {
      frames = total = winFrames = winTime = 0;
      minFps = Infinity;
    },
    // dt: 前フレームからの実経過秒。タブ非表示などで1秒を超える間隔は描画負荷ではないので除外する。
    add(dt) {
      if (!(dt > 0) || dt > 1) return;
      frames++;
      total += dt;
      winFrames++;
      winTime += dt;
      if (winTime >= 1) {
        minFps = Math.min(minFps, winFrames / winTime);
        winFrames = 0;
        winTime = 0;
      }
    },
    summary() {
      if (!frames) return {};
      const avg = frames / total;
      return { avg_fps: round1(avg), min_fps: round1(Math.min(avg, minFps)) };
    },
  };
}
