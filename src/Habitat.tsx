import { useEffect, useState } from "react";
import {
  habitatFrame,
  SCENES,
  workflowScenes,
  type Phase,
  type Scene,
} from "./scenes";
import type { Move } from "../shared/types";
import { Icon } from "./icons";

export function useReducedMotion() {
  const [reduce, setReduce] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}

export function Habitat({
  phase,
  move,
  reused,
  cooldown,
  onGallery,
}: {
  phase: Phase;
  move: Move | null;
  reused: boolean;
  cooldown: boolean;
  onGallery: () => void;
}) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
  const [tick, setTick] = useState(0);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    setCycle(0);
  }, [phase, move]);
  useEffect(() => {
    if (paused || reduced || document.hidden) return;
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 700);
    const sceneTimer = window.setInterval(() => {
      setCycle((c) => c + 1);
    }, 5600);
    return () => {
      clearInterval(timer);
      clearInterval(sceneTimer);
    };
  }, [paused, reduced, phase]);
  useEffect(() => {
    if (!sound || !["complete", "error", "cancelled"].includes(phase)) return;
    // Short, locally synthesized cue. No files, microphone access, or audio network requests.
    const context = new AudioContext();
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = phase === "complete" ? 660 : 330;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    oscillator.onended = () => {
      void context.close();
    };
    return () => {
      void context.close().catch(() => undefined);
    };
  }, [phase, sound]);
  const ids = workflowScenes(phase, move, reused, cooldown);
  const scene = SCENES.find((s) => s.id === ids[cycle % ids.length])!;
  return (
    <section className="habitat" aria-labelledby="habitat-title">
      <div className="habitat-heading">
        <div className="habitat-title">
          <span className="status-dot" />
          <h2 id="habitat-title">The little habitat</h2>
        </div>
        <div className="habitat-controls">
          <button
            className="icon-button"
            aria-label={sound ? "Mute habitat sounds" : "Enable habitat sounds"}
            aria-pressed={sound}
            title={sound ? "Mute sounds" : "Enable sounds"}
            onClick={() => setSound((v) => !v)}
          >
            <Icon name={sound ? "volume" : "mute"} />
          </button>
          <button
            className="icon-button"
            aria-label={
              paused ? "Resume habitat animation" : "Pause habitat animation"
            }
            aria-pressed={paused || reduced}
            disabled={reduced}
            title={
              reduced
                ? "Reduced motion is enabled"
                : paused
                  ? "Resume animation"
                  : "Pause animation"
            }
            onClick={() => setPaused((v) => !v)}
          >
            <Icon name={paused || reduced ? "play" : "pause"} />
          </button>
        </div>
      </div>
      <div className={`habitat-window ${move ? "detour-habitat" : ""}`}>
        <div className="habitat-coordinate" aria-hidden="true">
          <span>burrow / 001</span>
          <span>{paused || reduced ? "still life" : "ascii habitat"}</span>
        </div>
        <pre className="ascii desktop-ascii" aria-hidden="true">
          {habitatFrame(scene, reduced || paused ? 0 : tick)}
        </pre>
        <pre className="ascii mobile-ascii" aria-hidden="true">
          {habitatFrame(scene, reduced || paused ? 0 : tick, true)}
        </pre>
        <div className="habitat-caption">
          <span className="scene-number">
            {String(SCENES.indexOf(scene) + 1).padStart(2, "0")} /{" "}
            {SCENES.length}
          </span>
          <span>{scene.name}</span>
          <span aria-hidden="true">:)</span>
        </div>
      </div>
      <div className="habitat-bottom">
        <span>{scene.caption}</span>
        <button className="text-button" onClick={onGallery}>
          Explore scenes <Icon name="arrow" size={16} />
        </button>
      </div>
      <p className="habitat-note">
        A window into the workflow, never the model’s thoughts.
      </p>
    </section>
  );
}

export function Gallery() {
  const [selected, setSelected] = useState<Scene>(SCENES[0]);
  const [group, setGroup] = useState("All scenes");
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || paused) return;
    const interval = setInterval(() => setTick((t) => t + 1), 700);
    return () => clearInterval(interval);
  }, [reduced, paused]);
  const groups = ["All scenes", ...new Set(SCENES.map((s) => s.group))];
  return (
    <div className="gallery">
      <p>
        Preview all {SCENES.length} scenes. These are illustrations, not live
        workflow events.
      </p>
      <div className="gallery-preview">
        <pre className="ascii" aria-hidden="true">
          {habitatFrame(selected, reduced || paused ? 0 : tick, true)}
        </pre>
        <strong>{selected.name}</strong>
        <p>{selected.caption}</p>
        <button
          className="text-button"
          onClick={() => setPaused((v) => !v)}
          disabled={reduced}
        >
          <Icon name={paused ? "play" : "pause"} />
          {reduced
            ? "Reduced motion enabled"
            : paused
              ? "Resume preview"
              : "Pause preview"}
        </button>
      </div>
      <label htmlFor="scene-filter">Browse scenes</label>
      <select
        id="scene-filter"
        value={group}
        onChange={(e) => setGroup(e.target.value)}
      >
        {groups.map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
      <div className="scene-list">
        {SCENES.filter((s) => group === "All scenes" || s.group === group).map(
          (scene) => (
            <button
              key={scene.id}
              className={selected.id === scene.id ? "selected-scene" : ""}
              aria-pressed={selected.id === scene.id}
              onClick={() => setSelected(scene)}
            >
              <span className="scene-number">
                {String(SCENES.indexOf(scene) + 1).padStart(2, "0")}
              </span>
              <span>
                {scene.name}
                <small>{scene.group}</small>
              </span>
              <Icon name="chevron" size={16} />
            </button>
          ),
        )}
      </div>
    </div>
  );
}
