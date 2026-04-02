"use client";

import { useMemo, useState } from "react";

type ClientSummary = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  _count: {
    jobs: number;
    quotes: number;
    invoices: number;
  };
};

type ClientRowActionsProps = {
  client: ClientSummary;
  allClients: ClientSummary[];
  deleteAction: (formData: FormData) => void | Promise<void>;
  mergeAction: (formData: FormData) => void | Promise<void>;
};

function formatClientOption(client: ClientSummary) {
  return client.companyName ? `${client.name} · ${client.companyName}` : client.name;
}

export default function ClientRowActions({ client, allClients, deleteAction, mergeAction }: ClientRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [keepClientId, setKeepClientId] = useState(client.id);
  const [removeClientId, setRemoveClientId] = useState("");

  const alternateClients = useMemo(() => allClients.filter((row) => row.id !== client.id), [allClients, client.id]);
  const keepClient = allClients.find((row) => row.id === keepClientId) || client;
  const removeClient = allClients.find((row) => row.id === removeClientId) || null;

  return (
    <>
      <button type="button" className="saas-inline-action saas-inline-danger" onClick={() => setDeleteOpen(true)}>
        Delete
      </button>
      <button
        type="button"
        className="saas-inline-action"
        onClick={() => {
          setKeepClientId(client.id);
          setRemoveClientId("");
          setMergeOpen(true);
        }}
      >
        Merge
      </button>

      {deleteOpen ? (
        <div className="saas-modal-backdrop" onClick={() => setDeleteOpen(false)}>
          <div
            className="saas-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-client-title-${client.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="saas-modal-header">
              <h2 id={`delete-client-title-${client.id}`}>Delete {client.name}?</h2>
              <button type="button" className="saas-modal-close" onClick={() => setDeleteOpen(false)} aria-label="Close dialog">
                ×
              </button>
            </div>
            <p className="saas-modal-copy">
              This will permanently remove the client record only if it has no linked jobs, quotes, or invoices.
            </p>
            <div className="saas-modal-stats">
              <span>Jobs: {client._count.jobs}</span>
              <span>Quotes: {client._count.quotes}</span>
              <span>Invoices: {client._count.invoices}</span>
            </div>
            {client._count.jobs || client._count.quotes || client._count.invoices ? (
              <div className="banner">
                This client cannot be deleted yet. Merge it into another client or remove the linked records first.
              </div>
            ) : null}
            <div className="saas-modal-actions">
              <button type="button" className="button secondary" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="clientId" value={client.id} />
                <button
                  type="submit"
                  className="button saas-button-danger"
                  disabled={Boolean(client._count.jobs || client._count.quotes || client._count.invoices)}
                >
                  Delete Client
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {mergeOpen ? (
        <div className="saas-modal-backdrop" onClick={() => setMergeOpen(false)}>
          <div
            className="saas-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`merge-client-title-${client.id}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="saas-modal-header">
              <h2 id={`merge-client-title-${client.id}`}>Merge Clients</h2>
              <button type="button" className="saas-modal-close" onClick={() => setMergeOpen(false)} aria-label="Close dialog">
                ×
              </button>
            </div>
            <p className="saas-modal-copy">
              Choose which client to keep. Jobs, quotes, and invoices from the removed client will be reassigned to the kept client.
            </p>

            <form action={mergeAction} className="saas-modal-form">
              <label className="saas-modal-field">
                <span>Keep this client</span>
                <select
                  className="input"
                  name="keepClientId"
                  value={keepClientId}
                  onChange={(event) => {
                    const nextKeepId = event.target.value;
                    setKeepClientId(nextKeepId);
                    if (removeClientId === nextKeepId) {
                      setRemoveClientId("");
                    }
                  }}
                >
                  {allClients.map((row) => (
                    <option key={row.id} value={row.id}>
                      {formatClientOption(row)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="saas-modal-field">
                <span>Remove this client</span>
                <select className="input" name="removeClientId" value={removeClientId} onChange={(event) => setRemoveClientId(event.target.value)}>
                  <option value="">Select a client to merge away</option>
                  {allClients
                    .filter((row) => row.id !== keepClientId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {formatClientOption(row)}
                      </option>
                    ))}
                </select>
              </label>

              {removeClient ? (
                <div className="saas-modal-summary">
                  <div>
                    <strong>Keeping:</strong> {keepClient.name}
                  </div>
                  <div>
                    <strong>Removing:</strong> {removeClient.name}
                  </div>
                  <div className="saas-modal-stats">
                    <span>Jobs moving: {removeClient._count.jobs}</span>
                    <span>Quotes moving: {removeClient._count.quotes}</span>
                    <span>Invoices moving: {removeClient._count.invoices}</span>
                  </div>
                </div>
              ) : (
                <div className="saas-empty-state">
                  <div>Select the duplicate client you want to remove.</div>
                  <div>The kept client stays active as the default record.</div>
                </div>
              )}

              <div className="saas-modal-actions">
                <button type="button" className="button secondary" onClick={() => setMergeOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button" disabled={!removeClientId || removeClientId === keepClientId || alternateClients.length === 0}>
                  Merge Clients
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
