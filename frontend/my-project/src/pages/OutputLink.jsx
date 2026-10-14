import { getSampleOutputDownloadUrl } from "./api";

const KIND_LABEL = { germline: "Germline", somatic: "Somatic", prs: "PRS" };

export function OutputLink({ sid, kind, filename }) {
  if (!filename) {
    return (
      <span className="output-missing" title="Not produced by the latest completed run">
        —
      </span>
    );
  }
  return (
    <a
      href={getSampleOutputDownloadUrl(sid, kind)}
      download={filename}
      title={filename}
      className="output-link"
    >
      {KIND_LABEL[kind]}
    </a>
  );
}