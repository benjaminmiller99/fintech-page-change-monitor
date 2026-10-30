export type PageSnapshot = {
  url: string;
  content: string;
};

export type ChangeDecision = {
  changed: boolean;
  subject: string;
  body: string;
};

export function decidePageChange(previous: PageSnapshot | undefined, current: PageSnapshot): ChangeDecision {
  const changed = previous?.content !== current.content;
  const subject = changed ? `Fintech page changed: ${current.url}` : `Fintech page checked: ${current.url}`;
  const body = changed
    ? `The monitored page changed. Previous length: ${previous?.content.length ?? 0}; current length: ${current.content.length}. Review the page before taking action.`
    : `The monitored page is unchanged. Current length: ${current.content.length}. No action is recommended.`;
  return { changed, subject, body };
}
