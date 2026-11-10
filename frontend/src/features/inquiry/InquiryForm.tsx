import { type FormEvent, useId, useState } from 'react';
import { ApiError } from '../../api/client';
import { useInquiry } from '../../api/hooks';
import type { Offer } from '../../api/types';
import styles from './InquiryForm.module.css';

interface Props {
  offer: Offer;
  from: string;
  to: string;
  onDone: () => void;
}

/** "Request this plan". It stores a fictional inquiry; nothing is sent to a provider. */
export function InquiryForm({ offer, from, to, onDone }: Props) {
  const ids = { company: useId(), contact: useId(), traffic: useId() };
  const [values, setValues] = useState({ companyName: '', contact: '', expectedTraffic: '' });
  const mutation = useInquiry();
  const fields = mutation.error instanceof ApiError ? mutation.error.fields : {};
  const general =
    mutation.error && Object.keys(fields).length === 0 ? mutation.error.message : (fields.offerId ?? null);

  function submit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ offerId: offer.id, from, to, ...values });
  }

  if (mutation.isSuccess) {
    return (
      <div className={styles.confirm} role="status">
        <p>
          <strong>Request saved.</strong>
        </p>
        <p>{mutation.data.message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.submit} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form className={styles.form} onSubmit={submit}>
      <p>
        Requesting <strong>{offer.title}</strong>. This is a demonstration: nothing is sent to a provider.
      </p>
      <div className={styles.field}>
        <label htmlFor={ids.company}>Company name</label>
        <input
          id={ids.company}
          required
          maxLength={120}
          value={values.companyName}
          onChange={set('companyName')}
          aria-invalid={Boolean(fields.companyName)}
          aria-describedby={fields.companyName ? `${ids.company}-error` : undefined}
        />
        {fields.companyName && (
          <p id={`${ids.company}-error`} className={styles.error}>
            {fields.companyName}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.contact}>Contact email</label>
        <input
          id={ids.contact}
          type="email"
          required
          value={values.contact}
          onChange={set('contact')}
          aria-invalid={Boolean(fields.contact)}
          aria-describedby={fields.contact ? `${ids.contact}-error` : undefined}
        />
        {fields.contact && (
          <p id={`${ids.contact}-error`} className={styles.error}>
            {fields.contact}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor={ids.traffic}>Expected traffic</label>
        <textarea
          id={ids.traffic}
          maxLength={500}
          value={values.expectedTraffic}
          onChange={set('expectedTraffic')}
          aria-invalid={Boolean(fields.expectedTraffic)}
        />
        {fields.expectedTraffic && <p className={styles.error}>{fields.expectedTraffic}</p>}
      </div>
      {general && (
        <p role="alert" className={styles.error}>
          {general}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Request this plan'}
        </button>
      </div>
    </form>
  );
}
