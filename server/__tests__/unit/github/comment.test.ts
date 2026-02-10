import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @octokit/rest before importing the module
vi.mock('@octokit/rest', () => {
  const mockListComments = vi.fn();
  const mockUpdateComment = vi.fn();
  const mockCreateComment = vi.fn();

  return {
    Octokit: vi.fn().mockImplementation(() => ({
      issues: {
        listComments: mockListComments,
        updateComment: mockUpdateComment,
        createComment: mockCreateComment,
      },
    })),
    __mockListComments: mockListComments,
    __mockUpdateComment: mockUpdateComment,
    __mockCreateComment: mockCreateComment,
  };
});

// Mock config
vi.mock('../../../src/config.js', () => ({
  specForgeConfig: {
    comment: { marker: '<!-- specforge-review -->', updateExisting: true },
    guardrails: { aiProposalPrefix: '[AI提案]' },
  },
  env: {
    githubToken: 'test-token',
    githubOwner: 'kazushi-tech',
    githubRepo: 'new-project',
  },
}));

import { upsertReviewComment } from '../../../src/github/comment.js';

describe('upsertReviewComment', () => {
  let mockListComments: ReturnType<typeof vi.fn>;
  let mockUpdateComment: ReturnType<typeof vi.fn>;
  let mockCreateComment: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const octokitModule = await import('@octokit/rest');
    mockListComments = (octokitModule as any).__mockListComments;
    mockUpdateComment = (octokitModule as any).__mockUpdateComment;
    mockCreateComment = (octokitModule as any).__mockCreateComment;
  });

  it('should create a new comment when no existing marker comment found', async () => {
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 42 } });

    const result = await upsertReviewComment(1, '<!-- specforge-review -->\nTest body');

    expect(result.action).toBe('created');
    expect(result.commentId).toBe(42);
    expect(mockCreateComment).toHaveBeenCalledOnce();
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it('should update existing comment when marker found', async () => {
    mockListComments.mockResolvedValue({
      data: [
        { id: 99, body: '<!-- specforge-review -->\nOld content' },
      ],
    });
    mockUpdateComment.mockResolvedValue({});

    const result = await upsertReviewComment(1, '<!-- specforge-review -->\nNew content');

    expect(result.action).toBe('updated');
    expect(result.commentId).toBe(99);
    expect(mockUpdateComment).toHaveBeenCalledOnce();
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('should add marker if not present in body', async () => {
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 50 } });

    await upsertReviewComment(1, 'Body without marker');

    const callArgs = mockCreateComment.mock.calls[0][0];
    expect(callArgs.body).toContain('<!-- specforge-review -->');
  });

  it('should not duplicate marker if already present', async () => {
    mockListComments.mockResolvedValue({ data: [] });
    mockCreateComment.mockResolvedValue({ data: { id: 51 } });

    const body = '<!-- specforge-review -->\nContent';
    await upsertReviewComment(1, body);

    const callArgs = mockCreateComment.mock.calls[0][0];
    const markerCount = (callArgs.body.match(/<!-- specforge-review -->/g) || []).length;
    expect(markerCount).toBe(1);
  });
});
