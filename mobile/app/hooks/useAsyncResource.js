import { useEffect, useState } from "react";

export function useAsyncResource(factory, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: null });

    factory()
      .then((data) => {
        if (active) {
          setState({ loading: false, data, error: null });
        }
      })
      .catch((error) => {
        if (active) {
          setState({ loading: false, data: null, error });
        }
      });

    return () => {
      active = false;
    };
  }, deps);

  return state;
}
