/**
 * Notifications module barrel export — dispatcher is the deep module,
 * repository holds the read path + deprecated write shims (re-exported via dispatcher).
 */

export * from './actions';
export * from './repository';
export { dispatch, type DispatchNotification, type NotificationRecipients } from './dispatcher';
