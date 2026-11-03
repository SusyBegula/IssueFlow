"""Local password setup and reset. Passwords are read without terminal echo."""
import argparse
from getpass import getpass

from .config import settings
from .database import connect
from .security import hash_password


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["hash-password", "set-password"])
    args = parser.parse_args()
    password = getpass("Password: ")
    if not password or password != getpass("Confirm password: "):
        parser.error("Passwords must be nonempty and match.")
    encoded = hash_password(password)
    if args.command == "hash-password":
        print(f"AUTH_PASSWORD_HASH='{encoded}'")
        return
    with connect() as connection:
        user = connection.execute("update app_users set password_hash = %s where username = %s returning id", (encoded, settings().auth_username)).fetchone()
        if not user:
            parser.error("Account not found. Start the API once to initialize the account.")
        connection.execute("delete from sessions where user_id = %s", (user["id"],))
    print("Password updated; existing sessions revoked.")


if __name__ == "__main__":
    main()
