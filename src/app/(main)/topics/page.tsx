"use client";

import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/client-auth";
import { useUiLocale } from "@/components/i18n/UiLocaleProvider";
import { isDefaultCollectionName } from "@/lib/collection-constants";
import {
  buildTopicDetailsHref,
  launchOwnerPathEpisode,
} from "@/lib/learner-orchestration";
import { localizeErrorMessage } from "@/lib/ui-locale";

type Collection = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
};

type Subject = {
  id: string;
  title: string;
  description: string | null;
  collectionId: string | null;
  archivedAt: string | null;
};

type TopicAction =
  | { kind: "renameCollection"; id: string; currentName: string }
  | { kind: "deleteCollection"; id: string; name: string }
  | { kind: "renameSubject"; id: string; currentTitle: string }
  | { kind: "archiveSubject"; id: string; title: string };

function displayTopicGroupName(name: string, unassignedLabel: string) {
  return isDefaultCollectionName(name) ? unassignedLabel : name;
}

export default function SubjectsPage() {
  const { locale, messages } = useUiLocale();
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collectionName, setCollectionName] = useState("");
  const [collectionParentId, setCollectionParentId] = useState("");
  const [subjectTitle, setSubjectTitle] = useState("");
  const [subjectDescription, setSubjectDescription] = useState("");
  const [subjectCollectionId, setSubjectCollectionId] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [creatingSubject, setCreatingSubject] = useState(false);
  const [startingSubjectId, setStartingSubjectId] = useState<string | null>(null);
  const [topicAction, setTopicAction] = useState<TopicAction | null>(null);
  const [actionValue, setActionValue] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const topicActionPrimaryRef = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const topicActionOpenerRef = useRef<HTMLElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [collectionsRes, subjectsRes] = await Promise.all([
      authFetch("/api/collections"),
      authFetch("/api/subjects"),
    ]);

    if (!collectionsRes.ok || !subjectsRes.ok) {
      setError(messages.topics.errorLoad);
      setLoading(false);
      return;
    }

    const [collectionsJson, subjectsJson] = await Promise.all([
      collectionsRes.json(),
      subjectsRes.json(),
    ]);

    setCollections(collectionsJson);
    setSubjects(subjectsJson);
    setLoading(false);
  }, [messages.topics.errorLoad]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!topicAction) {
      topicActionOpenerRef.current?.focus();
      topicActionOpenerRef.current = null;
      return;
    }

    topicActionPrimaryRef.current?.focus();
  }, [topicAction]);

  const collectionsByParent = useMemo(() => {
    const map = new Map<string | null, Collection[]>();
    for (const collection of collections) {
      const key = collection.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(collection);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [collections]);

  const subjectsByCollection = useMemo(() => {
    const map = new Map<string | null, Subject[]>();
    for (const subject of subjects) {
      const key = subject.collectionId ?? null;
      const list = map.get(key) ?? [];
      list.push(subject);
      map.set(key, list);
    }
    return map;
  }, [subjects]);

  async function createCollection(event: React.FormEvent) {
    event.preventDefault();
    setCreatingCollection(true);
    setError(null);
    try {
      const response = await authFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: collectionName,
          parentId: collectionParentId || null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setError(localizeErrorMessage(json, locale, messages.topics.errorCreateGroup));
        return;
      }
      setCollectionName("");
      setCollectionParentId("");
      await loadData();
    } finally {
      setCreatingCollection(false);
    }
  }

  async function createSubject(event: React.FormEvent) {
    event.preventDefault();
    setCreatingSubject(true);
    setError(null);
    try {
      const response = await authFetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subjectTitle,
          description: subjectDescription || null,
          collectionId: subjectCollectionId || null,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setError(localizeErrorMessage(json, locale, messages.topics.errorCreateTopic));
        return;
      }
      const createdSubjectId =
        typeof json?.data?.id === "string" ? json.data.id : null;
      setSubjectTitle("");
      setSubjectDescription("");
      setSubjectCollectionId("");
      if (createdSubjectId) {
        router.push(buildTopicDetailsHref(createdSubjectId));
        return;
      }
      await loadData();
    } finally {
      setCreatingSubject(false);
    }
  }

  async function handleStartEpisode(subject: Subject) {
    setStartingSubjectId(subject.id);
    setError(null);

    try {
      const launch = await launchOwnerPathEpisode(authFetch, {
        subjectId: subject.id,
        subjectTitle: subject.title,
      });
      router.push(launch.href);
    } catch (requestError) {
      setError(localizeErrorMessage(requestError, locale, messages.learn.errorStart));
    } finally {
      setStartingSubjectId(null);
    }
  }

  function openTopicAction(action: TopicAction) {
    const opener = document.activeElement;
    topicActionOpenerRef.current = opener instanceof HTMLElement ? opener : null;
    setTopicAction(action);
    setActionValue(
      action.kind === "renameCollection"
        ? action.currentName
        : action.kind === "renameSubject"
          ? action.currentTitle
          : "",
    );
    setError(null);
  }

  function closeTopicAction() {
    if (actionBusy) return;
    setTopicAction(null);
    setActionValue("");
  }

  async function submitTopicAction(event: React.FormEvent) {
    event.preventDefault();
    if (!topicAction) return;

    const nextValue = actionValue.trim();
    if (
      (topicAction.kind === "renameCollection" ||
        topicAction.kind === "renameSubject") &&
      !nextValue
    ) {
      return;
    }

    setActionBusy(true);
    setError(null);
    try {
      let response: Response;
      if (topicAction.kind === "renameCollection") {
        response = await authFetch(`/api/collections/${topicAction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nextValue }),
        });
      } else if (topicAction.kind === "deleteCollection") {
        response = await authFetch(`/api/collections/${topicAction.id}`, {
          method: "DELETE",
        });
      } else if (topicAction.kind === "renameSubject") {
        response = await authFetch(`/api/subjects/${topicAction.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextValue }),
        });
      } else {
        response = await authFetch(`/api/subjects/${topicAction.id}`, {
          method: "DELETE",
        });
      }

      const json = await response.json().catch(() => null);
      if (!response.ok || json?.ok === false) {
        setError(localizeErrorMessage(json, locale, messages.topics.errorAction));
        return;
      }

      setTopicAction(null);
      setActionValue("");
      await loadData();
    } finally {
      setActionBusy(false);
    }
  }

  function renderCollectionTree(parentId: string | null, depth = 0): ReactNode[] {
    const list = collectionsByParent.get(parentId) ?? [];
    return list.flatMap((collection) => {
      const isDefault =
        isDefaultCollectionName(collection.name) &&
        collection.parentId === null;
      const subjectList = subjectsByCollection.get(collection.id) ?? [];
      return [
        <div
          key={collection.id}
          className="ui-panel ui-panel-tight text-sm"
          style={{ marginLeft: depth * 12 }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="ui-eyebrow">{messages.topics.topicGroupLabel}</p>
              <p className="ui-title-md mt-2 text-base">
                {displayTopicGroupName(collection.name, messages.topics.topicGroupNameDefault)}
              </p>
            </div>
            <div className="flex gap-2 text-xs">
              {isDefault ? (
                <span className="ui-meta">{messages.topics.default}</span>
              ) : (
                <>
                  <button
                    className="ui-action-secondary ui-action-xs"
                    type="button"
                    onClick={() =>
                      openTopicAction({
                        kind: "renameCollection",
                        id: collection.id,
                        currentName: displayTopicGroupName(
                          collection.name,
                          messages.topics.topicGroupNameDefault,
                        ),
                      })
                    }
                  >
                    {messages.topics.rename}
                  </button>
                  <button
                    className="ui-action-secondary ui-action-xs"
                    type="button"
                    onClick={() =>
                      openTopicAction({
                        kind: "deleteCollection",
                        id: collection.id,
                        name: displayTopicGroupName(
                          collection.name,
                          messages.topics.topicGroupNameDefault,
                        ),
                      })
                    }
                  >
                    {messages.topics.delete}
                  </button>
                </>
              )}
            </div>
          </div>
          {subjectList.length > 0 ? (
            <div className="mt-3 grid gap-2 text-xs text-slate-300">
              {subjectList.map((subject) => (
                <div
                  key={subject.id}
                  className="ui-panel-soft flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-slate-800 px-3 py-3"
                >
                  <div>
                    <p className="ui-eyebrow">{messages.topics.topic}</p>
                    <Link
                      className="mt-2 inline-block text-sm font-semibold underline"
                      href={`/topics/${subject.id}`}
                    >
                      {subject.title}
                    </Link>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => void handleStartEpisode(subject)}
                      disabled={startingSubjectId === subject.id}
                    >
                      {startingSubjectId === subject.id
                        ? messages.learn.startLoading
                        : messages.topics.startEpisode}
                    </button>
                    <button
                      className="ui-action-secondary ui-action-xs"
                      type="button"
                      onClick={() =>
                        openTopicAction({
                          kind: "renameSubject",
                          id: subject.id,
                          currentTitle: subject.title,
                        })
                      }
                    >
                      {messages.topics.rename}
                    </button>
                    <button
                      className="ui-action-secondary ui-action-xs"
                      type="button"
                      onClick={() =>
                        openTopicAction({
                          kind: "archiveSubject",
                          id: subject.id,
                          title: subject.title,
                        })
                      }
                    >
                      {messages.topics.archive}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>,
        ...renderCollectionTree(collection.id, depth + 1),
      ];
    });
  }

  const unassignedSubjects = subjectsByCollection.get(null) ?? [];
  const actionIsRename =
    topicAction?.kind === "renameCollection" || topicAction?.kind === "renameSubject";
  const actionIsDestructive =
    topicAction?.kind === "deleteCollection" || topicAction?.kind === "archiveSubject";
  const actionTitle =
    topicAction?.kind === "renameCollection"
      ? messages.topics.actionRenameGroupTitle
      : topicAction?.kind === "deleteCollection"
        ? messages.topics.actionDeleteGroupTitle
        : topicAction?.kind === "renameSubject"
          ? messages.topics.actionRenameTopicTitle
          : topicAction?.kind === "archiveSubject"
            ? messages.topics.actionArchiveTopicTitle
            : "";
  const actionBody =
    topicAction?.kind === "deleteCollection"
      ? messages.topics.confirmDeleteTopicGroupBody.replace("{name}", topicAction.name)
      : topicAction?.kind === "archiveSubject"
        ? messages.topics.confirmArchiveTopicBody.replace("{title}", topicAction.title)
        : "";
  const actionSubmitLabel =
    topicAction?.kind === "archiveSubject"
      ? messages.topics.confirmArchive
      : topicAction?.kind === "deleteCollection"
        ? messages.topics.confirmDelete
        : messages.topics.saveChanges;

  return (
    <section className="grid gap-6">
      <div className="ui-panel ui-panel-hero ui-panel-body">
        <p className="ui-eyebrow">
          {messages.shell.nav.topics}
        </p>
        <h2 className="ui-title-lg mt-3">{messages.topics.title}</h2>
        <p className="ui-copy-sm mt-2 max-w-3xl">
          {messages.topics.subtitle}
        </p>
        <p className="ui-meta mt-2">
          {messages.topics.topicGroupsNote}
        </p>
      </div>

      {error ? (
        <div
          className="ui-panel ui-panel-danger ui-panel-tight text-sm"
          role="alert"
        >
          <p>{error}</p>
          <p className="mt-2">{messages.topics.errorNextStep}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="ui-panel ui-panel-tight" role="status" aria-live="polite">
          <p className="ui-title-md text-base">{messages.topics.loading}</p>
          <p className="ui-copy-sm mt-2">{messages.topics.loadingBody}</p>
        </div>
      ) : null}

      {!loading ? (
        <>
          {subjects.length === 0 ? (
            <div className="ui-panel ui-panel-hero ui-panel-body" role="status">
              <p className="ui-eyebrow">{messages.topics.emptyTitle}</p>
              <h3 className="ui-title-lg mt-3">{messages.topics.emptyBody}</h3>
              <div className="mt-5">
                <button
                  className="ui-action-primary"
                  type="button"
                  onClick={() => {
                    const input = document.getElementById("topic-title");
                    if (input instanceof HTMLInputElement) {
                      input.focus();
                    }
                  }}
                >
                  {messages.topics.createFirstTopic}
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <form
              onSubmit={createCollection}
              className="order-2 ui-panel ui-panel-body"
            >
              <h3 className="ui-title-md">{messages.topics.createTopicGroup}</h3>
              <p className="ui-meta mt-2">
                {messages.topics.manageGroupsSecondary}
              </p>
              <div className="ui-form-grid mt-4">
                <label className="ui-label">
                  {messages.topics.name}
                  <input
                    className="ui-input"
                    value={collectionName}
                    onChange={(event) => setCollectionName(event.target.value)}
                    required
                  />
                </label>
                <label className="ui-label">
                  {messages.topics.parent}
                  <select
                    className="ui-select"
                    value={collectionParentId}
                    onChange={(event) => setCollectionParentId(event.target.value)}
                  >
                    <option value="">{messages.common.noParent}</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {displayTopicGroupName(
                          collection.name,
                          messages.topics.topicGroupNameDefault,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="ui-action-primary mt-4 w-full sm:w-auto"
                type="submit"
                disabled={creatingCollection}
              >
                {creatingCollection ? messages.topics.creating : messages.topics.createTopicGroup}
              </button>
            </form>

            <form
              onSubmit={createSubject}
              className="order-1 ui-panel ui-panel-body"
            >
              <h3 className="ui-title-md">{messages.topics.createTopic}</h3>
              <div className="ui-form-grid mt-4">
                <label className="ui-label">
                  {messages.topics.topicTitle}
                  <input
                    id="topic-title"
                    className="ui-input"
                    value={subjectTitle}
                    onChange={(event) => setSubjectTitle(event.target.value)}
                    required
                  />
                </label>
                <label className="ui-label">
                  {messages.topics.description}
                  <textarea
                    rows={3}
                    className="ui-textarea"
                    value={subjectDescription}
                    onChange={(event) => setSubjectDescription(event.target.value)}
                  />
                </label>
                <label className="ui-label">
                  {messages.topics.topicGroup}
                  <select
                    className="ui-select"
                    value={subjectCollectionId}
                    onChange={(event) => setSubjectCollectionId(event.target.value)}
                  >
                    <option value="">{messages.topics.unassignedOption}</option>
                    {collections.map((collection) => (
                      <option key={collection.id} value={collection.id}>
                        {displayTopicGroupName(
                          collection.name,
                          messages.topics.topicGroupNameDefault,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="ui-meta mt-3">
                {messages.topics.addTopicGroupFirst}
              </p>
              <button
                className="ui-action-primary mt-4 w-full sm:w-auto"
                type="submit"
                disabled={creatingSubject}
              >
                {creatingSubject ? messages.topics.creating : messages.topics.createTopic}
              </button>
            </form>
          </div>

          <div className="ui-panel ui-panel-body">
            <h3 className="ui-title-md">{messages.topics.topicGroupAndTopics}</h3>
            <div className="mt-4 grid gap-3">
              {renderCollectionTree(null)}
              {unassignedSubjects.length > 0 ? (
                <div className="ui-panel ui-panel-tight text-sm">
                  <p className="ui-eyebrow">
                    {messages.topics.unassignedLabel}
                  </p>
                  <div className="mt-2 grid gap-2">
                    {unassignedSubjects.map((subject) => (
                      <div
                        key={subject.id}
                        className="ui-panel-soft flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-slate-800 px-3 py-3"
                      >
                        <Link className="text-sm font-semibold underline" href={`/topics/${subject.id}`}>
                          {subject.title}
                        </Link>
                        <div className="flex gap-2 text-xs">
                          <button
                            className="rounded-full bg-slate-100 px-3 py-1 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                            type="button"
                            onClick={() => void handleStartEpisode(subject)}
                            disabled={startingSubjectId === subject.id}
                          >
                            {startingSubjectId === subject.id
                              ? messages.learn.startLoading
                              : messages.topics.startEpisode}
                          </button>
                          <button
                            className="ui-action-secondary ui-action-xs"
                            type="button"
                            onClick={() =>
                              openTopicAction({
                                kind: "renameSubject",
                                id: subject.id,
                                currentTitle: subject.title,
                              })
                            }
                          >
                            {messages.topics.rename}
                          </button>
                          <button
                            className="ui-action-secondary ui-action-xs"
                            type="button"
                            onClick={() =>
                              openTopicAction({
                                kind: "archiveSubject",
                                id: subject.id,
                                title: subject.title,
                              })
                            }
                          >
                            {messages.topics.archive}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {topicAction ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 px-4 py-6"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !actionBusy) {
              event.preventDefault();
              closeTopicAction();
            }
          }}
        >
          <form
            className="ui-panel ui-panel-body w-full max-w-md"
            role={actionIsDestructive ? "alertdialog" : "dialog"}
            aria-modal="true"
            aria-labelledby="topic-action-title"
            aria-describedby={!actionIsRename ? "topic-action-description" : undefined}
            onSubmit={submitTopicAction}
          >
            <h3 id="topic-action-title" className="ui-title-md">
              {actionTitle}
            </h3>
            {actionIsRename ? (
              <label className="ui-label mt-4">
                {messages.topics.name}
                <input
                  ref={(node) => {
                    topicActionPrimaryRef.current = node;
                  }}
                  className="ui-input"
                  value={actionValue}
                  onChange={(event) => setActionValue(event.target.value)}
                  autoFocus
                  required
                />
              </label>
            ) : (
              <p id="topic-action-description" className="ui-copy-sm mt-3">
                {actionBody}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                ref={(node) => {
                  if (!actionIsRename) {
                    topicActionPrimaryRef.current = node;
                  }
                }}
                className="ui-action-secondary"
                type="button"
                onClick={closeTopicAction}
                disabled={actionBusy}
              >
                {messages.common.cancel}
              </button>
              <button
                className="ui-action-primary"
                type="submit"
                disabled={actionBusy || (actionIsRename && !actionValue.trim())}
              >
                {actionBusy ? messages.common.saving : actionSubmitLabel}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
