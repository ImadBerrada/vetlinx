// Explicit consumer contract shared by dispatch and operations queue visibility.
export const DELIVERY_EVENT_RESOURCES: Record<string, string> = {
  AppointmentRequested: 'appointment',
  AppointmentStatusChanged: 'appointment',
  AppointmentCheckedIn: 'appointment',
  AppointmentTimeProposed: 'appointment',
  AppointmentTimeAccepted: 'appointment',
  AppointmentTimeProposalClosed: 'appointment',
  CredentialVerified: 'verification_request',
  CredentialRejected: 'verification_request',
  VerificationInformationRequested: 'verification_request',
  CredentialExpired: 'credential',
  CredentialRevoked: 'credential',
};
