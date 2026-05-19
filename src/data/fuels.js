// Brennstoffe für Ofen & Calcinator.
// ncv  = unterer Heizwert [kJ/kg]
// co2  = fossiler CO2-Emissionsfaktor [kg CO2 / kg Brennstoff]  (biogener Anteil zählt 0)
// bio  = biogener Anteil (nur Anzeige)
// cost = €/t

export const FUELS = {
  coal: {
    name: 'Steinkohle',
    ncv: 27000, co2: 2.47, bio: 0, cost: 118,
  },
  petcoke: {
    name: 'Petrolkoks',
    ncv: 32500, co2: 3.20, bio: 0, cost: 96,
  },
  rdf: {
    name: 'Ersatzbrennstoff (RDF)',
    ncv: 17500, co2: 0.84, bio: 0.55, cost: 30,
  },
};
