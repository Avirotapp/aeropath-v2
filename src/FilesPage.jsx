import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "./lib/supabase";
import ActionSuccessModal from "./ActionSuccessModal";
import ActionConfirmModal from "./ActionConfirmModal";
import ModuleEmblem from "./ModuleEmblem";


const BUCKET = "aeropath-files";

const FILE_LIMITS = {
  STUDENT: 2 * 1024 * 1024,
  INSTRUCTOR: 10 * 1024 * 1024,
  ADMIN: 20 * 1024 * 1024,
  SAFETY_MANAGER: 20 * 1024 * 1024,
};


export default function FilesPage({
  role,
  onBack,
  onSignOut,
}) {
  const isAdminEquivalent =
    role === "ADMIN" ||
    role === "SAFETY_MANAGER";

  const [contexts, setContexts] =
    useState([]);

  const [files, setFiles] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [successModal, setSuccessModal] =
    useState(null);

  const [confirmAction, setConfirmAction] =
    useState(null);

  const [busy, setBusy] =
    useState(false);

  const [
    selectedContextKey,
    setSelectedContextKey,
  ] = useState("");

  const [
    sessionFile,
    setSessionFile,
  ] = useState(null);

  const [
    sessionDescription,
    setSessionDescription,
  ] = useState("");

  const [
    sharedScope,
    setSharedScope,
  ] = useState(
    "OPERATIONAL_DOCUMENT"
  );

  const [
    sharedFile,
    setSharedFile,
  ] = useState(null);

  const [
    sharedDescription,
    setSharedDescription,
  ] = useState("");


  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [
        contextsResult,
        filesResult,
      ] = await Promise.all([
        supabase.rpc(
          "list_file_upload_contexts_v2"
        ),

        supabase.rpc(
          "list_files_v2"
        ),
      ]);


      if (contextsResult.error) {
        throw contextsResult.error;
      }


      if (filesResult.error) {
        throw filesResult.error;
      }


      setContexts(
        contextsResult.data ?? []
      );

      setFiles(
        filesResult.data ?? []
      );
    } catch (err) {
      console.error(
        "Unable to load AeroPath files:",
        err
      );

      setError(
        err?.message ||
          "Unable to load files."
      );
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadData();
  }, []);


  const uploadableContexts =
    useMemo(
      () =>
        contexts.filter(
          (item) =>
            item.can_upload
        ),
      [contexts]
    );


  const selectedContext =
    useMemo(
      () =>
        uploadableContexts.find(
          (item) =>
            item.context_key ===
            selectedContextKey
        ) ?? null,
      [
        uploadableContexts,
        selectedContextKey,
      ]
    );


  const sessionFiles =
    files.filter(
      (item) =>
        item.file_scope ===
        "SESSION"
    );


  const currentSessionFiles =
    sessionFiles.filter(
      (item) =>
        !isPreviousSession(
          item
        )
    );


  const previousSessionFiles =
    sessionFiles.filter(
      (item) =>
        isPreviousSession(
          item
        )
    );


  const operationalDocuments =
    files.filter(
      (item) =>
        item.file_scope ===
        "OPERATIONAL_DOCUMENT"
    );


  const instructorBriefingFiles =
    files.filter(
      (item) =>
        item.file_scope ===
        "INSTRUCTOR_BRIEFING"
    );


  async function handleSessionUpload(
    event
  ) {
    event.preventDefault();

    setError("");


    if (!selectedContext) {
      setError(
        "Select a training session."
      );

      return;
    }


    if (!sessionFile) {
      setError(
        "Choose a file to upload."
      );

      return;
    }


    if (
      !validateFileSize(
        sessionFile,
        role
      )
    ) {
      setError(
        fileSizeError(role)
      );

      return;
    }


    try {
      setBusy(true);

      const storagePath =
        buildSessionStoragePath(
          selectedContext.student_id,
          sessionFile.name
        );


      await uploadStorageFile(
        storagePath,
        sessionFile
      );


      const { error: rpcError } =
        await supabase.rpc(
          "register_file_v2",
          {
            requested_scope:
              "SESSION",

            target_booking_id:
              selectedContext.booking_id,

            target_session_id:
              selectedContext.session_id ||
              null,

            uploaded_file_name:
              sessionFile.name,

            uploaded_storage_path:
              storagePath,

            uploaded_mime_type:
              sessionFile.type ||
              "application/octet-stream",

            uploaded_file_size:
              sessionFile.size,

            uploaded_description:
              sessionDescription.trim() ||
              null,
          }
        );


      if (rpcError) {
        await removeUnregisteredFile(
          storagePath
        );

        throw rpcError;
      }


      setSessionFile(null);
      setSessionDescription("");

      resetFileInput(
        "session-file-input"
      );

      await loadData();

      setSuccessModal({
        eyebrow:
          "SESSION FILE UPLOADED",
        title:
          "Session file uploaded",
        message:
          sessionFile.name,
        nextText:
          "The file is now attached to the selected AeroPath training context and is available according to the existing file permissions.",
      });
    } catch (err) {
      console.error(
        "Session file upload failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to upload file."
      );
    } finally {
      setBusy(false);
    }
  }


  async function handleSharedUpload(
    event
  ) {
    event.preventDefault();

    setError("");


    if (!isAdminEquivalent) {
      setError(
        "Only Admin or Safety Manager may distribute these documents."
      );

      return;
    }


    if (!sharedFile) {
      setError(
        "Choose a file to upload."
      );

      return;
    }


    if (
      !validateFileSize(
        sharedFile,
        role
      )
    ) {
      setError(
        fileSizeError(role)
      );

      return;
    }


    try {
      setBusy(true);

      const storagePath =
        buildSharedStoragePath(
          sharedScope,
          sharedFile.name
        );


      await uploadStorageFile(
        storagePath,
        sharedFile
      );


      const { error: rpcError } =
        await supabase.rpc(
          "register_file_v2",
          {
            requested_scope:
              sharedScope,

            target_booking_id:
              null,

            target_session_id:
              null,

            uploaded_file_name:
              sharedFile.name,

            uploaded_storage_path:
              storagePath,

            uploaded_mime_type:
              sharedFile.type ||
              "application/octet-stream",

            uploaded_file_size:
              sharedFile.size,

            uploaded_description:
              sharedDescription.trim() ||
              null,
          }
        );


      if (rpcError) {
        await removeUnregisteredFile(
          storagePath
        );

        throw rpcError;
      }


      setSharedFile(null);
      setSharedDescription("");

      resetFileInput(
        "shared-file-input"
      );

      await loadData();

      setSuccessModal({
        eyebrow:
          sharedScope ===
          "INSTRUCTOR_BRIEFING"
            ? "INSTRUCTOR BRIEFING PUBLISHED"
            : "OPERATIONAL DOCUMENT PUBLISHED",
        title:
          sharedScope ===
          "INSTRUCTOR_BRIEFING"
            ? "Instructor Briefing Room file published"
            : "Operational Document published",
        message:
          sharedFile.name,
        nextText:
          sharedScope ===
          "INSTRUCTOR_BRIEFING"
            ? "The document is available to authorised staff and remains hidden from students."
            : "The document is now available through AeroPath operational documents.",
      });
    } catch (err) {
      console.error(
        "Shared document upload failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to upload document."
      );
    } finally {
      setBusy(false);
    }
  }


  async function handleOpenFile(
    item
  ) {
    try {
      setError("");

      const {
        data,
        error: signedUrlError,
      } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(
          item.storage_path,
          600
        );


      if (signedUrlError) {
        throw signedUrlError;
      }


      window.open(
        data.signedUrl,
        "_blank",
        "noopener,noreferrer"
      );
    } catch (err) {
      console.error(
        "Unable to open file:",
        err
      );

      setError(
        err?.message ||
          "Unable to open file."
      );
    }
  }


  async function handleReplaceFile(
    item
  ) {
    const input =
      document.createElement(
        "input"
      );

    input.type = "file";


    input.onchange =
      async () => {
        const replacement =
          input.files?.[0];

        if (!replacement) {
          return;
        }


        if (
          !validateFileSize(
            replacement,
            role
          )
        ) {
          setError(
            fileSizeError(role)
          );

          return;
        }


        setError("");

        setConfirmAction({
          kind: "REPLACE",
          item,
          replacement,
          eyebrow:
            "REPLACE FILE",
          title:
            `Replace "${item.file_name}"?`,
          message:
            `New file: ${replacement.name}\n\nThe old physical Storage object will be permanently deleted after AeroPath registers the replacement version.`,
          confirmLabel:
            "Replace file",
          danger: false,
        });
      };


    input.click();
  }


  async function executeReplaceFile(
    item,
    replacement
  ) {
    let newStoragePath =
      null;

    try {
      setConfirmAction(null);
      setBusy(true);
      setError("");

      newStoragePath =
        buildReplacementStoragePath(
          item,
          replacement.name
        );


      await uploadStorageFile(
        newStoragePath,
        replacement
      );


      const {
        data: oldStoragePath,
        error: replaceError,
      } = await supabase.rpc(
        "replace_file_v2",
        {
          target_file_id:
            item.file_id,

          replacement_file_name:
            replacement.name,

          replacement_storage_path:
            newStoragePath,

          replacement_mime_type:
            replacement.type ||
            "application/octet-stream",

          replacement_file_size:
            replacement.size,
        }
      );


      if (replaceError) {
        await removeUnregisteredFile(
          newStoragePath
        );

        throw replaceError;
      }


      let cleanupWarning =
        false;

      if (oldStoragePath) {
        const {
          error: removeError,
        } = await supabase.storage
          .from(BUCKET)
          .remove([
            oldStoragePath,
          ]);


        if (removeError) {
          cleanupWarning =
            true;

          console.error(
            "Old physical file cleanup failed:",
            removeError
          );
        }
      }


      await loadData();

      setSuccessModal({
        eyebrow:
          cleanupWarning
            ? "FILE REPLACED — STORAGE CLEANUP PENDING"
            : "FILE REPLACED",
        title:
          cleanupWarning
            ? "Replacement completed with a storage warning"
            : "File replaced successfully",
        message:
          cleanupWarning
            ? "AeroPath registered the replacement, but could not immediately remove the old Storage object. The old file is no longer accessible through AeroPath."
            : `"${replacement.name}" is now the current file. The previous physical file was permanently deleted.`,
        nextText:
          "AeroPath retained the file/version audit history.",
      });
    } catch (err) {
      console.error(
        "File replacement failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to replace file."
      );
    } finally {
      setBusy(false);
    }
  }


  function handleDeleteFile(
    item
  ) {
    setError("");

    setConfirmAction({
      kind: "DELETE",
      item,
      eyebrow:
        "PERMANENT FILE DELETE",
      title:
        `Permanently delete "${item.file_name}"?`,
      message:
        "The physical file will be removed and cannot be recovered. AeroPath will retain the audit record.",
      confirmLabel:
        "Permanently delete",
      danger: true,
      inputLabel:
        "Deletion reason",
      inputPlaceholder:
        "Explain why this file is being permanently deleted.",
      inputRequired: true,
    });
  }


  async function executeDeleteFile(
    item,
    reason
  ) {
    try {
      setConfirmAction(null);
      setBusy(true);
      setError("");


      const {
        data: storagePath,
        error: deleteError,
      } = await supabase.rpc(
        "delete_file_v2",
        {
          target_file_id:
            item.file_id,

          reason:
            reason.trim(),
        }
      );


      if (deleteError) {
        throw deleteError;
      }


      let cleanupWarning =
        false;

      if (storagePath) {
        const {
          error: removeError,
        } = await supabase.storage
          .from(BUCKET)
          .remove([
            storagePath,
          ]);


        if (removeError) {
          cleanupWarning =
            true;

          console.error(
            "Storage deletion failed:",
            removeError
          );
        }
      }


      await loadData();

      setSuccessModal({
        eyebrow:
          cleanupWarning
            ? "FILE REMOVED — STORAGE CLEANUP PENDING"
            : "FILE PERMANENTLY DELETED",
        title:
          cleanupWarning
            ? "AeroPath record removed with a storage warning"
            : "File permanently deleted",
        message:
          cleanupWarning
            ? "The file was removed from AeroPath, but the physical Storage object could not be deleted immediately."
            : `"${item.file_name}" was permanently removed from Storage.`,
        nextText:
          "Audit history has been retained.",
      });
    } catch (err) {
      console.error(
        "File deletion failed:",
        err
      );

      setError(
        err?.message ||
          "Unable to delete file."
      );
    } finally {
      setBusy(false);
    }
  }




  return (
    <main className="app">
      <header className="topbar">
        <Brand compact />

        <div className="topbar-right">
          <span className="role">
            {formatRole(role)}
          </span>

          <button
            className="secondary"
            type="button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>


      <section className="admin-page">
        <button
          className="secondary back-button"
          type="button"
          onClick={onBack}
        >
          ← Back to dashboard
        </button>


        <div className="aero-page-heading">
          <div>
            <div className="eyebrow">DOCUMENT MANAGEMENT</div>
            <h1>Files</h1>
            <p className="muted">Training files and AeroPath operational documents.</p>
          </div>
          <ModuleEmblem name="files" />
        </div>


        <p
          className="muted"
          style={{
            marginTop: "-4px",
            marginBottom: "20px",
            fontStyle: "italic",
            fontSize: "13px",
          }}
        >
          Maximum upload size:{" "}
          {formatFileSize(
            FILE_LIMITS[role] ??
              FILE_LIMITS.STUDENT
          )}
          .
        </p>


        {error && (
          <div className="login-error">
            {error}
          </div>
        )}
{/* ==========================================
            SESSION UPLOAD
        ========================================== */}

        {uploadableContexts.length >
          0 && (
          <section
            className="card"
            style={{
              marginBottom: "24px",
            }}
          >
            <div className="eyebrow">
              SESSION DOCUMENT
            </div>

            <h2>
              Upload Session File
            </h2>


            {role === "STUDENT" && (
              <p className="muted">
                Student uploads close
                automatically when the
                instructor starts the
                session.
              </p>
            )}


            <form
              onSubmit={
                handleSessionUpload
              }
            >
              <label>
                Training session
              </label>

              <select
                value={
                  selectedContextKey
                }
                onChange={(event) =>
                  setSelectedContextKey(
                    event.target.value
                  )
                }
              >
                <option value="">
                  Select session
                </option>

                {uploadableContexts.map(
                  (item) => (
                    <option
                      key={
                        item.context_key
                      }
                      value={
                        item.context_key
                      }
                    >
                      {formatContext(
                        item,
                        role
                      )}
                    </option>
                  )
                )}
              </select>


              <label>
                File
              </label>

              <input
                id="session-file-input"
                type="file"
                onChange={(event) =>
                  setSessionFile(
                    event.target
                      .files?.[0] ??
                      null
                  )
                }
              />

              <p
                className="muted"
                style={{
                  marginTop: "6px",
                  marginBottom: "14px",
                  fontStyle: "italic",
                  fontSize: "12px",
                }}
              >
                Maximum file size:{" "}
                {formatFileSize(
                  FILE_LIMITS[role] ??
                    FILE_LIMITS.STUDENT
                )}
                .
              </p>


              <label>
                Description
              </label>

              <textarea
                value={
                  sessionDescription
                }
                onChange={(event) =>
                  setSessionDescription(
                    event.target.value
                  )
                }
                placeholder="Optional description"
              />


              <button
                className="primary"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Working..."
                  : "Upload session file"}
              </button>
            </form>
          </section>
        )}


        {/* ==========================================
            OPERATIONS DOCUMENT DISTRIBUTION
        ========================================== */}

        {isAdminEquivalent && (
          <section
            className="card"
            style={{
              marginBottom: "24px",
            }}
          >
            <div className="eyebrow">
              DOCUMENT DISTRIBUTION
            </div>

            <h2>
              Publish Document
            </h2>

            <p className="muted">
              Operational Documents are
              available to students and
              instructors. Instructor
              Briefing Room documents are
              hidden from students.
            </p>


            <form
              onSubmit={
                handleSharedUpload
              }
            >
              <label>
                Distribution area
              </label>

              <select
                value={sharedScope}
                onChange={(event) =>
                  setSharedScope(
                    event.target.value
                  )
                }
              >
                <option
                  value="OPERATIONAL_DOCUMENT"
                >
                  Operational Documents
                </option>

                <option
                  value="INSTRUCTOR_BRIEFING"
                >
                  Instructor Briefing Room
                </option>
              </select>


              <label>
                File
              </label>

              <input
                id="shared-file-input"
                type="file"
                onChange={(event) =>
                  setSharedFile(
                    event.target
                      .files?.[0] ??
                      null
                  )
                }
              />

              <p
                className="muted"
                style={{
                  marginTop: "6px",
                  marginBottom: "14px",
                  fontStyle: "italic",
                  fontSize: "12px",
                }}
              >
                Maximum file size:{" "}
                {formatFileSize(
                  FILE_LIMITS[role] ??
                    FILE_LIMITS.STUDENT
                )}
                .
              </p>


              <label>
                Description
              </label>

              <textarea
                value={
                  sharedDescription
                }
                onChange={(event) =>
                  setSharedDescription(
                    event.target.value
                  )
                }
                placeholder="Optional description"
              />


              <button
                className="primary"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Working..."
                  : "Publish document"}
              </button>
            </form>
          </section>
        )}


        {loading ? (
          <div className="admin-empty">
            Loading files...
          </div>
        ) : (
          <>
            <FileSection
              title="Current Session Files"
              subtitle={
                role === "STUDENT"
                  ? "Documents for your upcoming or active training sessions."
                  : "Documents attached to upcoming and active training sessions."
              }
              files={
                currentSessionFiles
              }
              role={role}
              busy={busy}
              onOpen={
                handleOpenFile
              }
              onReplace={
                handleReplaceFile
              }
              onDelete={
                handleDeleteFile
              }
              showSession
            />


            <FileSection
              title="Previous Session Files"
              subtitle="Documents retained with completed or previous training sessions."
              files={
                previousSessionFiles
              }
              role={role}
              busy={busy}
              onOpen={
                handleOpenFile
              }
              onReplace={
                handleReplaceFile
              }
              onDelete={
                handleDeleteFile
              }
              showSession
            />


            <FileSection
              title="Operational Documents"
              subtitle="Shared AeroPath operational and training resources."
              files={
                operationalDocuments
              }
              role={role}
              busy={busy}
              onOpen={
                handleOpenFile
              }
              onReplace={
                handleReplaceFile
              }
              onDelete={
                handleDeleteFile
              }
            />


            {role !== "STUDENT" && (
              <FileSection
                title="Instructor Briefing Room"
                subtitle="Internal material distributed to AeroPath instructors."
                files={
                  instructorBriefingFiles
                }
                role={role}
                busy={busy}
                onOpen={
                  handleOpenFile
                }
                onReplace={
                  handleReplaceFile
                }
                onDelete={
                  handleDeleteFile
                }
              />
            )}
          </>
        )}
      </section>

      <ActionConfirmModal
        open={Boolean(confirmAction)}
        eyebrow={
          confirmAction?.eyebrow
        }
        title={
          confirmAction?.title
        }
        message={
          confirmAction?.message
        }
        confirmLabel={
          confirmAction?.confirmLabel
        }
        danger={
          Boolean(
            confirmAction?.danger
          )
        }
        inputLabel={
          confirmAction?.inputLabel
        }
        inputPlaceholder={
          confirmAction?.inputPlaceholder
        }
        inputRequired={
          Boolean(
            confirmAction?.inputRequired
          )
        }
        onClose={() =>
          setConfirmAction(null)
        }
        onConfirm={(inputValue) => {
          if (
            confirmAction?.kind ===
            "REPLACE"
          ) {
            executeReplaceFile(
              confirmAction.item,
              confirmAction.replacement
            );

            return;
          }

          if (
            confirmAction?.kind ===
            "DELETE"
          ) {
            executeDeleteFile(
              confirmAction.item,
              inputValue
            );
          }
        }}
      />

      <ActionSuccessModal
        open={Boolean(successModal)}
        eyebrow={
          successModal?.eyebrow
        }
        title={
          successModal?.title
        }
        message={
          successModal?.message
        }
        nextText={
          successModal?.nextText
        }
        primaryLabel="Continue"
        secondaryLabel="Close"
        onPrimary={() =>
          setSuccessModal(null)
        }
        onClose={() =>
          setSuccessModal(null)
        }
      />
    </main>
  );
}


function FileSection({
  title,
  subtitle,
  files,
  role,
  busy,
  onOpen,
  onReplace,
  onDelete,
  showSession = false,
}) {
  return (
    <section
      style={{
        marginBottom: "34px",
      }}
    >
      <div className="eyebrow">
        FILE LIBRARY
      </div>

      <h2>
        {title}
      </h2>

      <p className="muted">
        {subtitle}
      </p>


      {files.length === 0 ? (
        <div className="admin-empty">
          No files in this section.
        </div>
      ) : (
        <div className="user-list">
          {files.map(
            (item) => (
              <FileCard
                key={
                  item.file_id
                }
                item={item}
                role={role}
                busy={busy}
                onOpen={onOpen}
                onReplace={
                  onReplace
                }
                onDelete={
                  onDelete
                }
                showSession={
                  showSession
                }
              />
            )
          )}
        </div>
      )}
    </section>
  );
}


function FileCard({
  item,
  role,
  busy,
  onOpen,
  onReplace,
  onDelete,
  showSession,
}) {
  return (
    <article className="user-card">
      <div className="user-card-header">
        <div>
          <div className="user-name">
            {item.file_name}
          </div>

          <div className="user-email">
            {formatFileSize(
              item.file_size
            )}
          </div>
        </div>

        <span className="status">
          {scopeLabel(
            item.file_scope
          )}
        </span>
      </div>


      {item.description && (
        <p>
          {item.description}
        </p>
      )}


      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginTop: "16px",
        }}
      >
        {showSession &&
          role !== "STUDENT" && (
          <Detail
            label="Student"
            value={
              item.student_name ||
              "—"
            }
          />
        )}


        {showSession && (
          <Detail
            label="Training resource"
            value={
              item.simulator_identifier
                ? `${item.simulator_name} · ${item.simulator_identifier}`
                : item.simulator_name ||
                  "—"
            }
          />
        )}


        {showSession && (
          <Detail
            label="Session"
            value={
              item.start_time
                ? formatDateTime(
                    item.start_time
                  )
                : "—"
            }
          />
        )}


        <Detail
          label="Uploaded by"
          value={
            item.uploaded_by_name ||
            "AeroPath User"
          }
        />


        <Detail
          label="Last updated"
          value={
            item.last_modified_at
              ? formatDateTime(
                  item.last_modified_at
                )
              : "—"
          }
        />


        {item.last_modified_by_name &&
          item.last_modified_by !==
            item.uploaded_by && (
          <Detail
            label="Updated by"
            value={
              item.last_modified_by_name
            }
          />
        )}
      </div>


      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "18px",
        }}
      >
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() =>
            onOpen(item)
          }
        >
          Open file
        </button>


        {item.can_modify && (
          <>
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                onReplace(item)
              }
            >
              Replace
            </button>

            <button
              className="danger-button"
              type="button"
              disabled={busy}
              onClick={() =>
                onDelete(item)
              }
            >
              Delete
            </button>
          </>
        )}
      </div>


      {role === "STUDENT" &&
        item.file_scope ===
          "SESSION" &&
        !item.can_modify && (
        <p
          className="muted"
          style={{
            marginTop: "14px",
            marginBottom: 0,
          }}
        >
          This file is read-only.
        </p>
      )}
    </article>
  );
}


function Detail({
  label,
  value,
}) {
  return (
    <div>
      <div className="eyebrow">
        {label}
      </div>

      <div>
        {value}
      </div>
    </div>
  );
}


async function uploadStorageFile(
  storagePath,
  file
) {
  const { error } =
    await supabase.storage
      .from(BUCKET)
      .upload(
        storagePath,
        file,
        {
          cacheControl:
            "3600",

          upsert:
            false,

          contentType:
            file.type ||
            undefined,
        }
      );


  if (error) {
    throw error;
  }
}


async function removeUnregisteredFile(
  storagePath
) {
  try {
    const { error } =
      await supabase.storage
        .from(BUCKET)
        .remove([
          storagePath,
        ]);


    if (error) {
      console.error(
        "Unable to clean unregistered upload:",
        error
      );
    }
  } catch (err) {
    console.error(
      "Unable to clean unregistered upload:",
      err
    );
  }
}


function buildSessionStoragePath(
  studentId,
  fileName
) {
  return `${studentId}/session/${crypto.randomUUID()}-${sanitiseFileName(
    fileName
  )}`;
}


function buildSharedStoragePath(
  scope,
  fileName
) {
  const folder =
    scope ===
    "INSTRUCTOR_BRIEFING"
      ? "instructor"
      : "operational";


  return `shared/${folder}/${crypto.randomUUID()}-${sanitiseFileName(
    fileName
  )}`;
}


function buildReplacementStoragePath(
  item,
  fileName
) {
  if (
    item.file_scope ===
    "SESSION"
  ) {
    return buildSessionStoragePath(
      item.student_id,
      fileName
    );
  }


  return buildSharedStoragePath(
    item.file_scope,
    fileName
  );
}


function sanitiseFileName(
  fileName
) {
  return fileName
    .trim()
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    )
    .replace(
      /_+/g,
      "_"
    );
}


function validateFileSize(
  file,
  role
) {
  const limit =
    FILE_LIMITS[role] ??
    FILE_LIMITS.STUDENT;

  return (
    file.size <= limit
  );
}


function fileSizeError(
  role
) {
  return `Maximum file size for ${formatRole(
    role
  )} uploads is ${formatFileSize(
    FILE_LIMITS[role] ??
      FILE_LIMITS.STUDENT
  )}.`;
}


function isPreviousSession(
  item
) {
  return (
    item.booking_status ===
      "COMPLETED" ||
    item.booking_status ===
      "CANCELLED" ||
    item.session_status ===
      "COMPLETED" ||
    item.session_status ===
      "CANCELLED"
  );
}


function formatContext(
  item,
  role
) {
  const student =
    role === "STUDENT"
      ? ""
      : `${item.student_name} · `;


  const simulator =
    item.simulator_identifier
      ? `${item.simulator_name} (${item.simulator_identifier})`
      : item.simulator_name;


  const date =
    item.start_time
      ? formatDateTime(
          item.start_time
        )
      : "No date";


  return `${student}${simulator} · ${date}`;
}


function formatDateTime(
  value
) {
  if (!value) {
    return "—";
  }


  return new Intl.DateTimeFormat(
    "en-SG",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",

      timeZone:
        "Asia/Singapore",
    }
  ).format(
    new Date(value)
  );
}


function formatFileSize(
  bytes
) {
  const value =
    Number(bytes) || 0;


  if (value < 1024) {
    return `${value} B`;
  }


  if (
    value <
    1024 * 1024
  ) {
    return `${(
      value / 1024
    ).toFixed(1)} KB`;
  }


  return `${(
    value /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}


function scopeLabel(
  scope
) {
  switch (scope) {
    case "SESSION":
      return "SESSION";

    case "OPERATIONAL_DOCUMENT":
      return "OPERATIONAL";

    case "INSTRUCTOR_BRIEFING":
      return "INSTRUCTOR";

    default:
      return scope;
  }
}


function resetFileInput(
  id
) {
  const input =
    document.getElementById(
      id
    );


  if (input) {
    input.value = "";
  }
}


function Brand({
  compact = false,
}) {
  return (
    <div
      className={
        compact
          ? "brand compact"
          : "brand"
      }
    >
      <div className="brand-name">
        AEROPATH
      </div>

      <div className="brand-by">
        by AEROVIATION
      </div>
    </div>
  );
}


function formatRole(
  role
) {
  switch (role) {
    case "STUDENT":
      return "Student";

    case "INSTRUCTOR":
      return "Instructor";

    case "ADMIN":
      return "Admin";

    case "SAFETY_MANAGER":
      return "Safety Manager";

    default:
      return role ?? "Unknown";
  }
}
