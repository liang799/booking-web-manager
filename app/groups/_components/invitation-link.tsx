"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import styles from "./group-detail.module.css";

/** Shows the invitation link with a Copy button. */
export function InvitationLink({ url }: { readonly url: string }) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const copied = copiedUrl === url;

  async function copy() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
    } catch {
      setCopiedUrl(null);
      setCopyError(true);
    }
  }

  return (
    <div className={styles.linkCopy}>
      <Input className={styles.linkInput} readOnly value={url} aria-label="Invitation link" onFocus={(event) => event.currentTarget.select()} />
      <Button type="button" className={styles.copyButton} onClick={copy}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? "Copied!" : "Copy link"}
      </Button>
      <span role="status" className={copyError ? "text-sm text-muted-foreground" : "sr-only"}>
        {copyError ? "Couldn't copy the link. Select the link above and copy it manually." : copied ? "Link copied" : ""}
      </span>
    </div>
  );
}
