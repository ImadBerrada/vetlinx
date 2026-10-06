CREATE TABLE appointments.clinic_resources (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations.organizations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('ROOM', 'EQUIPMENT', 'CARE_TEAM')),
  active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX clinic_resources_organization_id_active_idx ON appointments.clinic_resources(organization_id, active);
CREATE UNIQUE INDEX clinic_resources_organization_name_unique ON appointments.clinic_resources(organization_id, lower(name));
ALTER TABLE appointments.appointment_slots ADD COLUMN resources_reserved BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE appointments.appointment_slots ADD CONSTRAINT appointment_slots_published_resources_check CHECK (NOT published OR resources_reserved);
CREATE TABLE appointments.slot_resources (
  slot_id UUID NOT NULL REFERENCES appointments.appointment_slots(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES appointments.clinic_resources(id) ON DELETE RESTRICT,
  PRIMARY KEY (slot_id, resource_id)
);
CREATE INDEX slot_resources_resource_id_slot_id_idx ON appointments.slot_resources(resource_id, slot_id);
