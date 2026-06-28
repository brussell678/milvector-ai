type StageState = "pending" | "active" | "complete";

type Stage = {
  label: string;
  state: StageState;
};

type Props = {
  stages: Stage[];
};

export function StageBar({ stages }: Props) {
  return (
    <div className="tool-stage-bar" role="list" aria-label="Workflow stages">
      {stages.map((stage, idx) => (
        <div
          key={stage.label}
          className="tool-stage-step"
          data-state={stage.state}
          role="listitem"
          aria-current={stage.state === "active" ? "step" : undefined}
        >
          <span className="tool-stage-num" aria-hidden="true">
            {stage.state === "complete" ? "✓" : idx + 1}
          </span>
          <span className="hidden sm:inline">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}
