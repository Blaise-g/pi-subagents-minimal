# Keep model evaluation outside release automation

Model-output quality is assessed, when warranted by a Significant behavioral change, through one-off Recorded evaluations or Quality smokes rather than scheduled CI jobs or mechanical release gates. Provider runs are slow, costly, availability-dependent, and probabilistic, while their rubrics and judges should be designed for the behavior under evaluation; releases therefore rely on deterministic qualification, and any evaluation evidence remains separate supporting material retained for human review.
