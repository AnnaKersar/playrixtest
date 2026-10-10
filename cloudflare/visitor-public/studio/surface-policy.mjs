// Horizons measured at unobstructed side borders of original 430 × 480 C2 cards.
export const C2_SURFACE_POLICY={version:'c2-reference-plane/v1',heightFraction:.30,objectBottomFraction:.88,references:[
 {id:'R02C04',horizon:333},{id:'R03C07',horizon:340},{id:'R04C01',horizon:322},
 {id:'R05C04',horizon:232},{id:'R07C03',horizon:358},{id:'R08C07',horizon:314},
 {id:'R10C02',horizon:369},{id:'R10C04',horizon:348},{id:'R13C08',horizon:229},
 {id:'R15C06',horizon:372},{id:'R16C08',horizon:362}],referenceHeight:480,
 medianHeightFraction:140/480,method:'Visible full-width horizontal edge; ambiguous, curved and horizonless cards excluded. Fraction is plane height, including area behind the object, not unobstructed pixel area.'};
export const surfaceHorizon=height=>Math.round(height*(1-C2_SURFACE_POLICY.heightFraction));
