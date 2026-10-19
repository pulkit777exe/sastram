/**
 * Notifications module barrel export — dispatcher is the deep module,
 * repository holds the read path.
 */

export * from './actions';
export * from './repository';
export { dispatch, type DispatchNotification, type NotificationRecipients } from './dispatcher';
