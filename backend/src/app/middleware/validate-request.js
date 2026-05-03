export function validateBody(validator) {
  return (req, _res, next) => {
    try {
      req.body = validator(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParam(name, validator, mapInput = (value) => value) {
  return (req, _res, next) => {
    try {
      req.params[name] = validator(mapInput(req.params[name]));
      next();
    } catch (error) {
      next(error);
    }
  };
}
