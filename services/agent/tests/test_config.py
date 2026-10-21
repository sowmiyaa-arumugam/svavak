# Copyright 2026 Sowmiya Arumugam
# SPDX-License-Identifier: Apache-2.0
# Configuration: defaults, validation and the .env file, without ever showing the token.

import pytest  # test framework

from svavak_agent import config  # the module under test

TOKEN = "agent-token-for-tests-0123"  # a synthetic agent token, at least 16 characters


def test_defaults_are_mock_mode_and_the_eu_model():  # only the token is required
    c = config.load_config({"SVAVAK_AGENT_TOKEN": TOKEN})  # nothing else set
    assert (c.mode, c.agent_token, c.aws_profile) == ("mock", TOKEN, None)  # mock by default, no profile needed
    assert (c.aws_region, c.model_id) == ("eu-central-1", "eu.amazon.nova-2-lite-v1:0")  # plan §8.1 defaults


def test_live_mode_reads_the_aws_settings():  # live mode takes the profile, region and model from the environment
    env = {"SVAVAK_AGENT_TOKEN": TOKEN, "SVAVAK_MODE": "live", "AWS_PROFILE": "sso-profile", "AWS_REGION": "eu-west-1", "SVAVAK_MODEL_ID": "model-x"}  # every setting
    c = config.load_config(env)  # load them
    assert (c.mode, c.aws_profile, c.aws_region, c.model_id) == ("live", "sso-profile", "eu-west-1", "model-x")  # taken as given


@pytest.mark.parametrize(("env", "message"), [  # each refused setting and the start of its message
    ({"SVAVAK_AGENT_TOKEN": TOKEN, "SVAVAK_MODE": "Live"}, 'SVAVAK_MODE must be "mock" or "live"'),  # a typo
    ({}, "SVAVAK_AGENT_TOKEN must be set"),  # no token
    ({"SVAVAK_AGENT_TOKEN": "<agent-token>"}, "SVAVAK_AGENT_TOKEN must be set"),  # the .env.example placeholder
    ({"SVAVAK_AGENT_TOKEN": TOKEN, "SVAVAK_MODE": "live"}, "SVAVAK_MODE=live needs AWS_PROFILE"),  # live without a profile
    ({"SVAVAK_AGENT_TOKEN": TOKEN, "SVAVAK_MODE": "live", "AWS_PROFILE": "sso-profile", "AWS_BEARER_TOKEN_BEDROCK": "synthetic"}, "unset AWS_BEARER_TOKEN_BEDROCK"),  # botocore would sign with the API key instead of the profile
])  # end of the cases
def test_refuses_bad_settings_with_a_clear_message(env, message):  # fail closed, readably
    with pytest.raises(ValueError, match=message):  # a ValueError naming the setting
        config.load_config(env)  # the bad settings


@pytest.mark.parametrize("token", [TOKEN + " ", TOKEN + "\r", "agent token for tests 0123"])  # a trailing space or CR, or spaces inside
def test_refuses_a_token_that_is_not_a_valid_header_value_without_showing_it(token):  # else httpx's error would quote it in a traceback
    with pytest.raises(ValueError, match="visible ASCII") as refused:  # refused at start-up
        config.load_config({"SVAVAK_AGENT_TOKEN": token})  # the bad token
    assert token.strip() not in str(refused.value)  # the message never shows it


def test_the_token_never_appears_in_the_config_repr():  # a printed or logged Config must not leak it
    assert TOKEN not in repr(config.load_config({"SVAVAK_AGENT_TOKEN": TOKEN}))  # repr leaves it out


def test_read_env_takes_the_env_file_then_the_process_environment(tmp_path, monkeypatch):  # as Node's --env-file: the process wins
    env_file = tmp_path / ".env"  # a temporary .env
    env_file.write_text("SVAVAK_MODE=live\nAWS_REGION=eu-west-3\n", encoding="utf-8")  # two settings
    monkeypatch.setattr(config, "ENV_FILE", env_file)  # read it instead of the repository's
    monkeypatch.setenv("AWS_REGION", "eu-north-1")  # the process overrides one of them
    env = config.read_env()  # merge
    assert (env["SVAVAK_MODE"], env["AWS_REGION"]) == ("live", "eu-north-1")  # file value, then the override


def test_env_file_is_the_repository_root_env():  # services/agent/svavak_agent/config.py -> the repository root
    assert (config.ENV_FILE.parent / "CLAUDE.md").exists()  # the repository root holds CLAUDE.md
    assert config.ENV_FILE.name == ".env"  # and the file is .env
