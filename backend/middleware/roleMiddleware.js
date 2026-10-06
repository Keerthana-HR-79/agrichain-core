const roleMiddleware = (...allowedRoles) => {

  return (req, res, next) => {

    try {

      if (!allowedRoles.includes(req.user.role)) {

        return res.status(403).json({
          message: "Access forbidden",
        });

      }

      next();

    } catch (error) {

      res.status(500).json({
        message: "Server Error",
      });

    }

  };

};

module.exports = roleMiddleware;