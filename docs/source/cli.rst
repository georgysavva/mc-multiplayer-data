CLI
===

This page describes the main command-line entry points for data collection: ``run.sh`` (training data) and ``run_evals.sh`` (evaluation data).

.. _run-sh:

``run.sh``
----------------------------------

`[Source] <https://github.com/georgysavva/mc-multiplayer-data/tree/release/run.sh>`_

runs the full training data collection pipeline: it generates compose configs, starts Minecraft instances per batch, collects episodes, stops them, postprocesses (including comparison videos), then prepares and splits the train dataset and annotates some test videos.

Usage
~~~~~

.. code-block:: bash

   ./run.sh [OPTIONS]

Options
~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Option
     - Default
     - Description
   * - ``--output-dir DIR``
     - ``output2``
     - Base data directory for outputs
   * - ``--num-batches N``
     - ``2``
     - Number of batches to run
   * - ``--num-flat-world N``
     - ``1``
     - Number of flat worlds per batch
   * - ``--num-normal-world N``
     - ``1``
     - Number of normal worlds per batch
   * - ``--num-episodes N``
     - ``2``
     - Number of episodes per batch
   * - ``--dataset-name NAME``
     - ``duet``
     - Name of the output dataset under ``<output-dir>/datasets/``
   * - ``-h``, ``--help``
     -
     - Show usage and exit

Output layout
~~~~~~~~~~~~~

Data is written under ``<output-dir>/``:

- ``data_collection/train/batch_<i>/`` — per-batch compose configs, logs, and aligned outputs
- ``datasets/<dataset-name>/`` — prepared train dataset (after postprocess and split); some test split videos are annotated by ``annotate_video_batch.py``

.. _run-evals-sh:

``run_evals.sh``
-----------------------------------------

`[Source] <https://github.com/georgysavva/mc-multiplayer-data/tree/release/run_evals.sh>`_

Runs evaluation data collection for several episode types, then prepares the eval datasets and annotates some of the videos for debugging.

Usage
~~~~~

.. code-block:: bash

   ./run_evals.sh [OPTIONS]

Options
~~~~~~~

.. list-table::
   :header-rows: 1
   :widths: 25 15 60

   * - Option
     - Default
     - Description
   * - ``--output-dir DIR``
     - ``output2``
     - Base data directory for outputs
   * - ``-h``, ``--help``
     -
     - Show usage and exit

Environment
~~~~~~~~~~~

- ``EVAL_TIME_SET_DAY`` — If set (e.g. ``1``), episode start time is set to day for all eval episodes. Default: ``1``.

Eval episode types
~~~~~~~~~~~~~~~~~~

The script runs one batch per eval type:

- ``rotationEval``
- ``translationEval``
- ``structureEval``
- ``turnToLookEval``
- ``turnToLookOppositeEval``
- ``bothLookAwayEval``
- ``oneLooksAwayEval``

For ``turnToLookEval`` and ``turnToLookOppositeEval`` the script uses 1 normal world and 32 episodes; for the rest it uses 2 flatland worlds and 16 episodes per type.

Output layout
~~~~~~~~~~~~~

- ``<output-dir>/data_collection/eval/<eval_type>/`` — per-type compose configs, logs, and aligned outputs
- ``<output-dir>/datasets/eval/`` — prepared eval datasets (from ``postprocess/prepare_eval_datasets.py``); some videos are annotated by ``annotate_video_batch.py``
