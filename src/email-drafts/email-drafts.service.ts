import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';

type GraphMessage = {
  id: string;
  webLink: string;
};

type ProposalEmailDraft = {
  recipientEmail: string;
  subject: string;
  body: string;
  fileName: string;
  content: Buffer;
};

const smallAttachmentLimit = 3 * 1024 * 1024;
const maximumAttachmentSize = 150 * 1024 * 1024;
const uploadChunkSize = 2 * 1024 * 1024;

@Injectable()
export class EmailDraftsService {
  constructor(
    private readonly config: ConfigService,
    private readonly graph: MicrosoftGraphService,
  ) {}

  private mailboxUser() {
    return (
      this.config.get<string>('MICROSOFT_MAILBOX_USER')?.trim() ||
      'ximenam@bluelifepools.com'
    );
  }

  private messagePath(messageId: string) {
    return `/users/${encodeURIComponent(this.mailboxUser())}/messages/${encodeURIComponent(messageId)}`;
  }

  private async attachSmallFile(messageId: string, draft: ProposalEmailDraft) {
    await this.graph.request(`${this.messagePath(messageId)}/attachments`, {
      method: 'POST',
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: draft.fileName,
        contentType: 'application/pdf',
        contentBytes: draft.content.toString('base64'),
      }),
    });
  }

  private async attachLargeFile(messageId: string, draft: ProposalEmailDraft) {
    const session = await this.graph.request<{ uploadUrl: string }>(
      `${this.messagePath(messageId)}/attachments/createUploadSession`,
      {
        method: 'POST',
        body: JSON.stringify({
          AttachmentItem: {
            attachmentType: 'file',
            name: draft.fileName,
            size: draft.content.length,
            contentType: 'application/pdf',
          },
        }),
      },
    );

    for (
      let start = 0;
      start < draft.content.length;
      start += uploadChunkSize
    ) {
      const end = Math.min(start + uploadChunkSize, draft.content.length) - 1;
      const chunk = draft.content.subarray(start, end + 1);
      const response = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${draft.content.length}`,
        },
        body: chunk as unknown as BodyInit,
      });

      if (!response.ok) {
        throw new Error(
          `Microsoft Graph attachment upload failed (${response.status})`,
        );
      }
    }
  }

  async createProposalDraft(draft: ProposalEmailDraft) {
    if (draft.content.length > maximumAttachmentSize) {
      throw new Error('The proposal PDF exceeds the Outlook attachment limit.');
    }

    const mailbox = encodeURIComponent(this.mailboxUser());
    const message = await this.graph.request<GraphMessage>(
      `/users/${mailbox}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          subject: draft.subject,
          body: {
            contentType: 'Text',
            content: draft.body,
          },
          toRecipients: [
            {
              emailAddress: {
                address: draft.recipientEmail,
              },
            },
          ],
        }),
      },
    );

    try {
      if (draft.content.length < smallAttachmentLimit) {
        await this.attachSmallFile(message.id, draft);
      } else {
        await this.attachLargeFile(message.id, draft);
      }

      return this.graph.request<GraphMessage>(
        `${this.messagePath(message.id)}?$select=id,webLink`,
      );
    } catch (error) {
      try {
        await this.graph.request<void>(this.messagePath(message.id), {
          method: 'DELETE',
        });
      } catch {
        // The draft is best-effort cleanup if attaching the PDF fails.
      }
      throw error;
    }
  }
}
